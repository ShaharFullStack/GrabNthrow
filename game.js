import * as THREE from 'three';
import { SceneManager } from 'sceneManager';
import { HandTracker } from 'handTracker';
import { PhysicsObject } from 'physicsObject';

const GRAB_THRESHOLD = 1.2; // Increased from 0.7 for easier grabbing
const THROW_FORCE = 15;
const GROUND_Y = 0.22; // Y position of the ground (half of object height if it's a 0.5 cube)
const THROW_HISTORY_LENGTH = 5; // Number of frames to track for throw direction

export class Game {
    constructor(renderDiv) {
        this.renderDiv = renderDiv;
        this.sceneManager = new SceneManager(renderDiv);
        this.handTracker = new HandTracker();

        this.physicsObjects = [];
        this.heldObject = null;
        this.handIndicator = null;

        // Store recent hand positions for throw direction calculation
        this.handPositionHistory = [];
        this.lastGrabPosition = null;

        this.clock = new THREE.Clock();
        this.onReady = () => { }; // Callback for when MediaPipe is ready
    }

    async init() {
        this.sceneManager.init();
        await this.handTracker.init(this.sceneManager.camera);
        this._setupHandIndicator();
        this._createThrowableObjects();

        window.addEventListener('resize', () => this.sceneManager.onWindowResize(), false);
        if (this.onReady) this.onReady();
    }

    _setupHandIndicator() {
        // Create a group to hold all hand indicator elements
        this.handIndicator = new THREE.Group();

        // Main sphere for the hand position
        const sphereGeometry = new THREE.SphereGeometry(0.1, 16, 16);
        const sphereMaterial = new THREE.MeshStandardMaterial({
            color: 0xffff00,
            emissive: 0xccaa00,
            transparent: true,
            opacity: 0.8
        });
        const mainSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        this.handIndicator.add(mainSphere);

        // Add a ring to indicate depth
        const ringGeometry = new THREE.RingGeometry(0.12, 0.15, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6
        });
        this.depthRing = new THREE.Mesh(ringGeometry, ringMaterial);
        this.handIndicator.add(this.depthRing);

        // Add a shadow circle on the ground to indicate position
        const shadowGeometry = new THREE.CircleGeometry(0.1, 16);
        const shadowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        this.groundShadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
        this.groundShadow.rotation.x = -Math.PI / 2; // Flat on the ground
        this.groundShadow.position.y = 0.01; // Just above ground to avoid z-fighting
        this.sceneManager.scene.add(this.groundShadow);

        this.handIndicator.visible = false;
        this.sceneManager.scene.add(this.handIndicator);
    }

    _createThrowableObjects() {
        const sphereGeometry = new THREE.SphereGeometry(0.25, 32, 32);
        const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];

        // Keep track of existing positions to avoid overlap
        const existingPositions = [];

        for (let i = 0; i < 6; i++) {
            const material = new THREE.MeshStandardMaterial({ 
                color: colors[i],
                roughness: 0.7,
                metalness: 0.2
            });

            // Generate a position that doesn't overlap with existing objects
            let position;
            let validPosition = false;
            let attempts = 0;

            while (!validPosition && attempts < 20) {
                position = new THREE.Vector3(
                    (Math.random() - 0.5) * 4,
                    0.5 + Math.random() * 1.5, // Higher starting position
                    (Math.random() - 0.5) * 2 - 1
                );

                // Check against existing positions
                validPosition = true;
                for (const existingPos of existingPositions) {
                    if (position.distanceTo(existingPos) < 0.8) { // Minimum distance
                        validPosition = false;
                        break;
                    }
                }

                attempts++;
            }

            // If we couldn't find a valid position, use a fallback
            if (!validPosition) {
                position = new THREE.Vector3(
                    i * 0.8 - 2, // Line them up if we can't find random positions
                    0.5 + i * 0.2,
                    -1
                );
            }

            existingPositions.push(position.clone());

            const obj = new PhysicsObject(new THREE.Mesh(sphereGeometry, material), position);
            this.physicsObjects.push(obj);
            this.sceneManager.scene.add(obj.mesh);
        }
    }

    start() {
        this.sceneManager.renderer.setAnimationLoop(() => this.update());
    }

    update() {
        const deltaTime = this.clock.getDelta();
        this.handTracker.update();

        const handData = this.handTracker.getHandData();

                    // Hand indicator update
        if (handData && handData.landmarks) {
            this.handIndicator.visible = true;

            // Get depth estimation
            const depthEstimate = this.handTracker.estimateDepth();

            // Use the depth to affect the ring size - now non-inverted
            // Closer hand (larger depthEstimate) = larger ring
            // Further hand (smaller depthEstimate) = smaller ring
            const ringScale = 1.0 + (depthEstimate) * 0.5; // Scale from 1.0 to 1.5 based on closeness
            this.depthRing.scale.set(ringScale, ringScale, 1);
            
            // Also adjust opacity based on depth - closer = more opaque
            this.depthRing.material.opacity = 0.3 + (depthEstimate) * 0.4; // 0.3 to 0.7 based on closeness
            
            // Color feedback for depth - now non-inverted
            // Blend between blue (far) and red (near)
            const r = Math.floor(255 * (depthEstimate));
            const b = Math.floor(255 * (1.0 - depthEstimate));
            const g = 50; // Low green component for better visibility
            
            const depthColor = new THREE.Color(r/255, g/255, b/255);
            
            // Apply color to hand indicator's emissive component
            if (this.handIndicator instanceof THREE.Group) {
                this.handIndicator.children[0].material.emissive = depthColor;
            }
            
            // Update shadow color too
            this.groundShadow.material.color.copy(depthColor);
                
            // Convert normalized screen coords to world space for indicator
            const screenPos = new THREE.Vector2(handData.screenPosition.x, handData.screenPosition.y);
            this.sceneManager.updateWorldPositionFromScreen(this.handIndicator, screenPos, 5, depthEstimate);

            // Update depth ring orientation to always face the camera
            this.depthRing.lookAt(this.sceneManager.camera.position);

            // Update ground shadow position to be directly below the hand indicator
            this.groundShadow.position.x = this.handIndicator.position.x;
            this.groundShadow.position.z = this.handIndicator.position.z;
            this.groundShadow.visible = true;

            // Scale the shadow based on height from ground for better depth perception
            const heightFromGround = this.handIndicator.position.y - GROUND_Y;
            const shadowScale = Math.max(0.1, Math.min(0.3, 0.1 + (heightFromGround * 0.05)));
            this.groundShadow.scale.set(shadowScale, shadowScale, 1);

            // Adjust opacity based on height
            this.groundShadow.material.opacity = Math.max(0.1, Math.min(0.4, 0.4 - (heightFromGround * 0.03)));
            
            // Store hand position for throw direction calculation
            this.handPositionHistory.push(this.handIndicator.position.clone());
            if (this.handPositionHistory.length > THROW_HISTORY_LENGTH) {
                this.handPositionHistory.shift();
            }
        } else {
            this.handIndicator.visible = false;
            this.groundShadow.visible = false;
        }
        
        // Provide visual feedback for objects that can be grabbed
        if (handData && handData.landmarks && this.handIndicator.visible && !this.heldObject) {
            // Reset all object highlights first
            this.physicsObjects.forEach(obj => {
                if (!obj.isHeld && obj.mesh.material) {
                    obj.mesh.material.emissive = new THREE.Color(0x000000);
                }
            });
            
            // Highlight objects that can be grabbed
            const raycaster = new THREE.Raycaster();
            const screenPos = new THREE.Vector2(
                handData.screenPosition.x * 2 - 1,
                -(handData.screenPosition.y * 2 - 1)
            );
            
            raycaster.setFromCamera(screenPos, this.sceneManager.camera);
            
            // Check for intersections with all meshes
            const meshes = this.physicsObjects.map(obj => obj.mesh);
            const intersects = raycaster.intersectObjects(meshes, false);
            
            // Highlight the first intersected object
            if (intersects.length > 0) {
                const objIndex = meshes.indexOf(intersects[0].object);
                if (objIndex !== -1) {
                    const obj = this.physicsObjects[objIndex];
                    if (!obj.isHeld && obj.mesh.material) {
                        obj.mesh.material.emissive = new THREE.Color(0x222222);
                    }
                }
            }
            
            // Also highlight objects close to the hand indicator
            for (const obj of this.physicsObjects) {
                if (!obj.isHeld) {
                    const distance = obj.mesh.position.distanceTo(this.handIndicator.position);
                    if (distance < GRAB_THRESHOLD * 1.5) { // Slightly larger threshold for highlighting
                        obj.mesh.material.emissive = new THREE.Color(0x222222);
                    }
                }
            }
        }

        // IMPROVED GRABBING LOGIC
        if (handData && handData.isGrabbing) {
            // Update indicator color for grabbing
            if (this.handIndicator instanceof THREE.Group) {
                this.handIndicator.children[0].material.color.setHex(0x00ff00); // Green when grabbing
            } else {
                this.handIndicator.material.color.setHex(0x00ff00); // Green when grabbing
            }
            
            if (!this.heldObject) {
                // Store position where grab started for throw direction calculation
                this.lastGrabPosition = this.handIndicator.position.clone();
                
                // Reset hand position history on new grab
                this.handPositionHistory = [];
                
                // Create a raycaster for better 3D grabbing
                const raycaster = new THREE.Raycaster();
                const screenPos = new THREE.Vector2(
                    handData.screenPosition.x * 2 - 1, // Convert from 0-1 to -1 to 1
                    -(handData.screenPosition.y * 2 - 1) // Invert Y for Three.js convention
                );
                
                // Set the raycaster to shoot from the camera through the hand position on screen
                raycaster.setFromCamera(screenPos, this.sceneManager.camera);
                
                // Check which objects the ray intersects
                const grabCandidates = [];
                
                // Prepare meshes for raycasting
                const meshes = this.physicsObjects.map(obj => obj.mesh);
                const intersects = raycaster.intersectObjects(meshes, false);
                
                // Find all potential objects to grab
                for (const intersect of intersects) {
                    // Find which physicsObject this mesh belongs to
                    const objIndex = meshes.indexOf(intersect.object);
                    if (objIndex !== -1) {
                        grabCandidates.push({
                            object: this.physicsObjects[objIndex],
                            distance: intersect.distance
                        });
                    }
                }
                
                // Also consider objects that are close to the hand indicator in 3D space
                for (const obj of this.physicsObjects) {
                    if (!obj.isHeld) {
                        const distance = obj.mesh.position.distanceTo(this.handIndicator.position);
                        if (distance < GRAB_THRESHOLD) {
                            // Check if this object is already a candidate
                            const existingCandidate = grabCandidates.find(c => c.object === obj);
                            if (!existingCandidate) {
                                grabCandidates.push({
                                    object: obj,
                                    distance: distance
                                });
                            }
                        }
                    }
                }
                
                // Sort candidates by distance and grab the closest one
                if (grabCandidates.length > 0) {
                    grabCandidates.sort((a, b) => a.distance - b.distance);
                    this.heldObject = grabCandidates[0].object;
                    this.heldObject.grab();
                    
                    // Provide visual feedback for the grabbed object
                    this.heldObject.mesh.material.emissive = new THREE.Color(0x333333);
                }
            } else {
                // Continue to record hand position history while holding
                if (this.handPositionHistory.length > 0) {
                    const lastPos = this.handPositionHistory[this.handPositionHistory.length - 1];
                    // Only add new position if it's significantly different from the last one
                    if (lastPos.distanceTo(this.handIndicator.position) > 0.01) {
                        this.handPositionHistory.push(this.handIndicator.position.clone());
                        if (this.handPositionHistory.length > THROW_HISTORY_LENGTH) {
                            this.handPositionHistory.shift();
                        }
                    }
                }
            }
        } else { // Not grabbing or hand not detected
            // Update indicator color
            if (this.handIndicator && this.handIndicator.visible) {
                if (this.handIndicator instanceof THREE.Group) {
                    this.handIndicator.children[0].material.color.setHex(0xffff00); // Yellow otherwise
                } else {
                    this.handIndicator.material.color.setHex(0xffff00); // Yellow otherwise
                }
            }
            
            if (this.heldObject) {
                // Reset emissive color of the previously held object
                this.heldObject.mesh.material.emissive = new THREE.Color(0x000000);
                
                // IMPROVED THROW DIRECTION CALCULATION
                let throwDirection = new THREE.Vector3(0, 0.3, -1).normalize(); // Default direction
                let throwForce = THROW_FORCE;
                
                // Calculate throw direction from hand movement history
                if (this.handPositionHistory.length >= 2) {
                    // Use the motion vector between the first and last positions in history
                    const startPos = this.handPositionHistory[0];
                    const endPos = this.handPositionHistory[this.handPositionHistory.length - 1];
                    
                    // Calculate the movement vector
                    const throwVector = new THREE.Vector3().subVectors(endPos, startPos);
                    
                    // Only use this vector if it has significant magnitude
                    if (throwVector.length() > 0.05) {
                        // Forward/backward now properly aligned - no need to invert Z
                        throwVector.z *= 2.5; // Increase depth influence
                        throwVector.x *= 2.5; // Increase horizontal influence
                        throwVector.y = Math.max(0.2, throwVector.y); // Ensure some upward motion
                        
                        throwDirection = throwVector.normalize();
                        
                        // Adjust throw force based on hand speed
                        const handSpeed = throwVector.length() / (this.handPositionHistory.length * deltaTime);
                        throwForce = Math.min(THROW_FORCE * 1.5, Math.max(THROW_FORCE * 0.7, handSpeed * 5));
                    }
                }
                
                // Fallback to camera-based direction if hand history insufficient
                if (throwDirection.length() < 0.1) {
                    this.sceneManager.camera.getWorldDirection(throwDirection);
                    throwDirection.y = Math.max(0.2, throwDirection.y + 0.2); // Ensure some upward component
                }
                
                // Apply throw
                this.heldObject.release(throwDirection, throwForce);
                this.heldObject = null;
                
                // Reset hand position history after throw
                this.handPositionHistory = [];
                this.lastGrabPosition = null;
            }
        }

        // Update held object position
        if (this.heldObject) {
            this.heldObject.update(deltaTime, this.handIndicator.position);
        }

        // Update physics for all non-held objects
        this.physicsObjects.forEach(obj => {
            if (obj !== this.heldObject) {
                obj.update(deltaTime);
            }
        });

        // Handle object-to-object collisions
        for (let i = 0; i < this.physicsObjects.length; i++) {
            for (let j = i + 1; j < this.physicsObjects.length; j++) {
                const objA = this.physicsObjects[i];
                const objB = this.physicsObjects[j];
                
                // Skip collision checks if either object is being held
                if (objA === this.heldObject || objB === this.heldObject) {
                    continue;
                }
                
                if (objA.checkCollision(objB)) {
                    objA.resolveCollision(objB);
                }
            }
        }

        this.sceneManager.render();
    }
}