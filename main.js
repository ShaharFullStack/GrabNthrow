import { Game } from 'game';

const renderDiv = document.getElementById('renderDiv');
if (!renderDiv) {
    console.error('Fatal Error: renderDiv not found in the DOM.');
} else {
    const game = new Game(renderDiv);
    game.init().then(() => {
        game.start();
        // Add a simple instruction text
        const instructions = document.createElement('div');
        instructions.innerHTML = `
            <div style="position: absolute; top: 10px; left: 10px; color: white; font-family: Arial, sans-serif; font-size: 16px; background-color: rgba(0,0,0,0.5); padding: 10px; border-radius: 5px;">
                <p>Show your hand to the camera.</p>
                <p>Pinch thumb and index finger to grab.</p>
                <p>Release to throw.</p>
                <p>Loading MediaPipe model... (may take a moment)</p>
            </div>
        `;
        document.body.appendChild(instructions);
        game.onReady = () => {
            const loadingMsg = instructions.querySelector('p:last-child');
            if (loadingMsg) loadingMsg.textContent = "MediaPipe Ready!";
            setTimeout(() => { 
                if (loadingMsg) loadingMsg.style.display = 'none';
            }, 3000);
        };
    }).catch(error => {
        console.error("Failed to initialize game:", error);
        if (renderDiv) {
            renderDiv.innerHTML = `<p style="color: white; text-align: center; margin-top: 50px;">Error initializing game. Please ensure you have a webcam and have granted camera permissions. Check console for details.</p>`;
        }
    });
}