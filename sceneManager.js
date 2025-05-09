import * as THREE from 'three';

export class SceneManager {
    constructor(renderDiv) {
        this.renderDiv = renderDiv;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, this.renderDiv.clientWidth / this.renderDiv.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.raycaster = new THREE.Raycaster();
    }

    init() {
        this.renderer.setSize(this.renderDiv.clientWidth, this.renderDiv.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderDiv.appendChild(this.renderer.domElement);

        this.camera.position.set(0, 2, 4); // Slightly elevated and back
        this.camera.lookAt(0, 0.5, 0);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7.5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        this.scene.add(directionalLight);

        // Ground
        const groundGeometry = new THREE.PlaneGeometry(20, 20);
        const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Sky
        this.scene.background = new THREE.Color(0x87ceeb); 
        this.scene.fog = new THREE.Fog(0x87ceeb, 10, 50);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = this.renderDiv.clientWidth / this.renderDiv.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.renderDiv.clientWidth, this.renderDiv.clientHeight);
    }

    // Update the world position of an object based on screen position
    updateWorldPositionFromScreen(object, screenPosition, distance, depthFactor = 0.5) {
    // screenPosition is normalized (0-1 top-left, to 0-1 bottom-right from MediaPipe)
    // Three.js raycaster wants -1 to 1, with Y inverted
    const vec = new THREE.Vector3(
        screenPosition.x * 2 - 1,
        -(screenPosition.y * 2 - 1),
        0.5 // unproject from near plane
    );
    vec.unproject(this.camera);
    vec.sub(this.camera.position).normalize();
    
    // Adjust distance based on depth factor (0-1)
    // With inverted depth, 0 = near, 1 = far
    const nearDistance = 2;
    const farDistance = 7;
    
    // INVERTED: Use depthFactor directly (0=near, 1=far)
    const adjustedDistance = nearDistance + (depthFactor * (farDistance - nearDistance));
    
    const worldPos = this.camera.position.clone().add(vec.multiplyScalar(adjustedDistance));
    object.position.copy(worldPos);
}
}