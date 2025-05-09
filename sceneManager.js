import * as THREE from 'three';

export class SceneManager {
    constructor(renderDiv) {
        this.renderDiv = renderDiv;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, this.renderDiv.clientWidth / this.renderDiv.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.raycaster = new THREE.Raycaster();
        this.BALL_RADIUS = 0.325; // Added ball radius constant to match PhysicsObject
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

        // Ground - unchanged
        const groundGeometry = new THREE.PlaneGeometry(20, 20);
        const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Sky - unchanged
        this.scene.background = new THREE.Color(0x87ceeb); 
        this.scene.fog = new THREE.Fog(0x87ceeb, 10, 50);
    }

    // Method to create a ball
    createBall(position = { x: 0, y: 1, z: 0 }, color = 0x1a75ff) {
        const ballGeometry = new THREE.SphereGeometry(this.BALL_RADIUS, 32, 32);
        const ballMaterial = new THREE.MeshStandardMaterial({ 
            color: color,
            roughness: 0.7,
            metalness: 0.2
        });
        const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
        
        // Set initial position
        ballMesh.position.set(position.x, position.y, position.z);
        
        // Add ball to scene
        this.scene.add(ballMesh);
        
        return ballMesh;
    }

    // Method to create a random colored ball
    createRandomBall(position = { x: 0, y: 1, z: 0 }) {
        // Generate a random color
        const hue = Math.random();
        const saturation = 0.7 + Math.random() * 0.3; // 0.7-1.0
        const lightness = 0.4 + Math.random() * 0.3;  // 0.4-0.7
        const color = new THREE.Color().setHSL(hue, saturation, lightness);
        
        return this.createBall(position, color);
    }

    // Method to create a textured ball
    createTexturedBall(position = { x: 0, y: 1, z: 0 }, texturePath) {
        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load(texturePath);
        
        const ballGeometry = new THREE.SphereGeometry(this.BALL_RADIUS, 32, 32);
        const ballMaterial = new THREE.MeshStandardMaterial({ 
            map: texture,
            roughness: 0.7,
            metalness: 0.2
        });
        
        const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
        ballMesh.position.set(position.x, position.y, position.z);
        this.scene.add(ballMesh);
        
        return ballMesh;
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = this.renderDiv.clientWidth / this.renderDiv.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.renderDiv.clientWidth, this.renderDiv.clientHeight);
    }

    // Update the world position of an object based on screen position - unchanged
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

    // Method to check if a point (like from a hand) hits a ball
    checkBallHit(point, balls) {
        this.raycaster.set(this.camera.position, 
            new THREE.Vector3().subVectors(point, this.camera.position).normalize());
        
        // Get all intersected objects
        const intersects = this.raycaster.intersectObjects(
            balls.map(ball => ball.mesh)
        );
        
        // Return the first ball that was hit, if any
        return intersects.length > 0 ? balls.find(ball => ball.mesh === intersects[0].object) : null;
    }
}