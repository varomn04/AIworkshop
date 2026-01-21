const chatHistory = document.getElementById('chat-history');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const studentIdInput = document.getElementById('studentId');
const debugPanel = document.getElementById('debug-panel');
const debugContent = document.getElementById('debug-content');

// Función para formatear texto simple (negritas y saltos de línea)
const formatText = (text) => {
    if (!text) return "";
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Negritas **texto**
        .replace(/\n/g, '<br>'); // Saltos de línea
};

function addMessage(text, sender, tools = []) {
    const divRow = document.createElement('div');
    // Flexbox de Bootstrap: 'justify-content-end' (derecha) para usuario, 'start' (izquierda) para AI
    divRow.className = `d-flex ${sender === 'user' ? 'justify-content-end' : 'justify-content-start'} mb-3 message-animation`;

    // Clases para la burbuja de chat
    const bubbleClass = sender === 'user' 
        ? 'bg-primary text-white rounded-top rounded-start' // Usuario: Azul
        : 'bg-white shadow-sm border text-dark rounded-top rounded-end'; // AI: Blanco con borde

    let toolsHtml = '';
    if (tools && tools.length > 0) {
        // Badges de Bootstrap para las tools
        const badges = tools.map(t => `<span class="badge bg-secondary me-1" style="font-size: 0.7em;">🛠 ${t}</span>`).join('');
        toolsHtml = `<div class="mt-2 pt-2 border-top border-secondary-subtle">${badges}</div>`;
    }

    const contentHtml = `
        <div class="p-3 ${bubbleClass}" style="max-width: 80%;">
            <div class="msg-content">${formatText(text)}</div>
            ${toolsHtml}
        </div>
    `;

    divRow.innerHTML = contentHtml;
    chatHistory.appendChild(divRow);
    
    // Auto-scroll al fondo
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

const handleSend = async () => {
    const text = userInput.value.trim();
    if (!text) return;

    // 1. Mostrar mensaje usuario
    addMessage(text, 'user');
    userInput.value = '';
    
    // Estado de carga
    const originalBtnContent = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: studentIdInput.value || "A12",
                conversation_id: 'dev-test',
                message: text
            })
        });

        const data = await response.json();

        if (data.error) {
            addMessage(`❌ Error: ${data.error}`, 'system');
        } else {
            // 2. Mostrar respuesta del agente
            const aiText = data.response?.response || "⚠️ No se recibió respuesta textual.";
            const tools = data.response?.actions_taken || [];
            addMessage(aiText, 'ai', tools);

            // 3. Debug info (Opcional)
            if (data.debug) {
                debugPanel.style.display = 'block';
                debugContent.textContent = JSON.stringify(data.debug, null, 2);
            }
        }

    } catch (e) {
        addMessage(`❌ Error de conexión: ${e.message}`, 'system');
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalBtnContent;
        userInput.focus();
    }
};

// Listeners
sendBtn.addEventListener('click', handleSend);

userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});