import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { SystemMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

const app = express();
app.use(express.json());

// --- CONFIGURACIÓN DE LOGS Y API ---
console.log("------------------------------------------------");
console.log("Iniciando servidor Agéntico...");

// Verificación de credenciales
const apiKey = process.env.CEREBRAS_API_KEY || process.env.GROQ_API_KEY;
const baseURL = process.env.CEREBRAS_BASE_URL || "https://api.groq.com/openai/v1";

if (!apiKey) {
    console.error("❌ ERROR CRÍTICO: No se ha encontrado ninguna API KEY en el archivo .env");
    console.error("Asegúrate de tener CEREBRAS_API_KEY o GROQ_API_KEY definidas.");
    process.exit(1);
} else {
    console.log("✅ API Key detectada.");
}
console.log("------------------------------------------------");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));
const PORT = process.env.PORT || 3000;

// 1. CONFIGURACIÓN DEL MODELO (Compatible con Cerebras y Groq)
const llm = new ChatOpenAI({
  apiKey: apiKey, 
  modelName: process.env.CEREBRAS_MODEL || "llama-3.3-70b-versatile", // Nombre del modelo por defecto
  configuration: {
    baseURL: baseURL,
  },
  temperature: 0, // Temperatura 0 es vital para que no "invente" al usar herramientas
});

// 2. DEFINICIÓN DE HERRAMIENTAS (TOOLS)

// TOOL 1: Obtener Perfil
const getStudentProfile = new DynamicStructuredTool({
  name: "get_student_profile",
  description: "Obtiene el perfil del estudiante (nombre, empresa, tutor) dado su ID.",
  schema: z.object({
    student_id: z.string().describe("El ID del estudiante (ej. A12)")
  }),
  func: async ({ student_id }) => {
    try {
      const data = JSON.parse(fs.readFileSync("./data/students.json", "utf-8"));
      const student = data.find(s => s.id === student_id);
      return student ? JSON.stringify(student) : "Estudiante no encontrado. Pide al usuario que verifique su ID.";
    } catch (e) { return "Error técnico leyendo base de datos de estudiantes."; }
  },
});

// TOOL 2: Listar Tareas (SOLUCIÓN PERSISTENCIA: Lee tareas base + nuevas tareas)
const listWeekTasks = new DynamicStructuredTool({
  name: "list_week_tasks",
  description: "Lista TODAS las tareas (del curso y personales creadas) para un estudiante.",
  schema: z.object({
    student_id: z.string(),
    week_id: z.string().describe("Identificador de la semana (ej. 2026-W02)")
  }),
  func: async ({ student_id, week_id }) => {
    try {
      // 1. Leer tareas base (tasks.json)
      const baseData = JSON.parse(fs.readFileSync("./data/tasks.json", "utf-8"));
      const studentRecord = baseData.find(r => r.student_id === student_id && r.week_id === week_id);
      let tasks = studentRecord ? [...studentRecord.tasks] : [];

      // 2. Leer tareas nuevas/followups (followups.json)
      if (fs.existsSync("./data/followups.json")) {
          const followupsData = JSON.parse(fs.readFileSync("./data/followups.json", "utf-8"));
          // Filtrar las creadas por este alumno
          const myFollowups = followupsData.filter(f => f.student_id === student_id);
          
          // Formatearlas para que parezcan tareas normales
          const formattedFollowups = myFollowups.map(f => ({
              id: `custom-${f.id}`, // ID único
              title: f.title + ` (Prioridad: ${f.priority})`,
              status: "pending", // Por defecto pendiente
              is_custom: true
          }));

          // 3. Fusionar ambas listas
          tasks = [...tasks, ...formattedFollowups];
      }

      if (tasks.length === 0) return "No hay tareas registradas para este estudiante esta semana.";
      
      return JSON.stringify(tasks);

    } catch (e) { 
        console.error(e);
        return "Error técnico leyendo las tareas."; 
    }
  },
});

// TOOL 3: Crear Tarea (Guarda en disco)
const createFollowupTask = new DynamicStructuredTool({
  name: "create_followup_task",
  description: "Crea y GUARDA una nueva tarea o recordatorio para el estudiante.",
  schema: z.object({
    student_id: z.string(),
    title: z.string().describe("Título descriptivo de la tarea"),
    priority: z.enum(["low", "medium", "high"]).describe("Prioridad de la tarea")
  }),
  func: async ({ student_id, title, priority }) => {
    try {
      const filePath = "./data/followups.json";
      let data = [];
      
      // Asegurar que el archivo existe y leerlo
      if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8").trim();
          if (content) {
              try {
                  data = JSON.parse(content);
              } catch (parseError) {
                  data = []; // Si el JSON está corrupto, empezamos de cero
              }
          }
      }
      
      const newTask = { 
          id: Date.now(), 
          student_id, 
          title, 
          priority, 
          created_at: new Date().toISOString() 
      };
      
      data.push(newTask);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      
      return `✅ Tarea guardada correctamente con ID ${newTask.id}. Ahora aparecerá en tu lista de tareas.`;
    } catch (e) { 
        console.error("Error writing file:", e);
        return "Error técnico: No se pudo guardar la tarea en el disco."; 
    }
  },
});

const tools = [getStudentProfile, listWeekTasks, createFollowupTask];
const llmWithTools = llm.bindTools(tools);

// Cargar System Prompt de forma robusta
let SYSTEM_PROMPT = "Eres un asistente útil.";
try {
    if(fs.existsSync("./prompts/practice_agent.system.md")) {
        SYSTEM_PROMPT = fs.readFileSync("./prompts/practice_agent.system.md", "utf-8");
    } else {
        console.warn("⚠️ AVISO: No se encontró prompts/practice_agent.system.md");
    }
} catch(e) { console.error(e); }

// 3. ENDPOINT PRINCIPAL (AGENT LOOP)
app.post("/api/chat", async (req, res) => {
  const { message, student_id } = req.body;
  
  if (!message) return res.status(400).json({ error: "El mensaje no puede estar vacío." });

  // Historial simplificado
  const messages = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(`${message} (Contexto actual: StudentID: ${student_id || "Desconocido"})`)
  ];

  const MAX_STEPS = 6; // Damos margen para pensar y corregir
  let steps = 0;
  let finalResponse = null;

  try {
    // BUCLE AGÉNTICO
    while (steps < MAX_STEPS) {
      steps++;
      
      // 1. Invocar al LLM
      const aiMsg = await llmWithTools.invoke(messages);
      messages.push(aiMsg);

      // 2. ¿Quiere usar herramientas?
      if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
        console.log(`🔹 [Paso ${steps}] Ejecutando tools:`, aiMsg.tool_calls.map(t => t.name));
        
        for (const toolCall of aiMsg.tool_calls) {
          const selectedTool = tools.find(t => t.name === toolCall.name);
          if (selectedTool) {
            try {
                // Ejecutar tool
                const toolOutput = await selectedTool.invoke(toolCall.args);
                
                // Añadir resultado al historial para que el LLM lo vea
                messages.push(new ToolMessage({
                  tool_call_id: toolCall.id,
                  content: toolOutput,
                  name: toolCall.name
                }));
                
                console.log(`   Result (${toolCall.name}):`, toolOutput.substring(0, 50) + "...");
            } catch (err) {
                console.error(`   Error en tool ${toolCall.name}:`, err);
                messages.push(new ToolMessage({
                    tool_call_id: toolCall.id,
                    content: "Error ejecutando la herramienta. Intenta otra cosa.",
                    name: toolCall.name
                }));
            }
          }
        }
        // VOLVEMOS AL INICIO DEL WHILE para que el LLM lea los resultados
      } else {
        // 3. Respuesta Final (No hay más tools)
        try {
            // Intentar limpiar JSON si el LLM mete texto extra
            const text = aiMsg.content;
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                finalResponse = JSON.parse(text.substring(start, end + 1));
            } else {
                throw new Error("No JSON found");
            }
        } catch (e) {
            // Fallback si falla el JSON estricto
            finalResponse = { 
                response: aiMsg.content, 
                actions_taken: [] 
            };
        }
        break; // Salir del bucle
      }
    }

    res.json({
      response: finalResponse || { response: "Lo siento, tuve un problema interno.", actions_taken: [] },
      debug: { steps_count: steps }
    });

  } catch (error) {
    console.error("🔥 Error en el servidor:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
});