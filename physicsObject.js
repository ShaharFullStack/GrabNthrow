import * as THREE from 'three';

const GRAVITY = new THREE.Vector3(0, -9.81, 0);
const GROUND_Y = 0.25; // Y position of the ground (half of object height if it's a 0.5 cube)
const GROUND_V = 0.25; // Y position of the ground (half of object height if it's a 0.5 cube)
const DAMPING_FACTOR = 0.98; // For velocity decay
const ANGULAR_DAMPING_FACTOR = 0.95;
const COLLISION_ELASTICITY = 0.7; // How bouncy collisions between cubes are (0-1)
const CUBE_SIZE = 0.65; // Size of cube (assuming all cubes have same size)

export class PhysicsObject {
    constructor(mesh, initialPosition) {
        this.mesh = mesh;
        this.mesh.castShadow = true;
        this.mesh.position.copy(initialPosition);

        // Ensure the object starts above the ground
        if (this.mesh.position.y < GROUND_Y) {
            this.mesh.position.y = GROUND_Y + 0.02;
        }

        this.velocity = new THREE.Vector3();
        this.angularVelocity = new THREE.Vector3();
        this.isHeld = false;
        this.size = CUBE_SIZE; // Size of the cube for collision detection
        this.mass = 1; // Default mass, could be variable in future
        this.lastCollisionTime = 0; // To prevent multiple collision detections in same frame
    }

    grab() {
        this.isHeld = true;
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        
        // Highlight the object with emissive material
        if (this.mesh.material) {
            this.mesh.material.emissive = new THREE.Color(0x333333);
            this.mesh.material.emissiveIntensity = 1.0;
            this.mesh.material.needsUpdate = true;
        }
    }
    
    release(direction, force) {
        this.isHeld = false;
        this.velocity.copy(direction).normalize().multiplyScalar(force);
        
        // Reset highlight
        if (this.mesh.material) {
            this.mesh.material.emissive = new THREE.Color(0x000000);
            this.mesh.material.emissiveIntensity = 0;
            this.mesh.material.needsUpdate = true;
        }
        
        // Add some random spin
        this.angularVelocity.set(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5
        );
    }

    // Check if this object collides with another object
    checkCollision(other) {
        // Skip if either object is held
        if (this.isHeld || other.isHeld) return false;

        // Simple collision check using bounding boxes
        const minDistance = this.size + other.size;
        const distance = this.mesh.position.distanceTo(other.mesh.position);

        // Skip very recent collisions (avoids multiple detections in one collision)
        const now = performance.now();
        if (now - this.lastCollisionTime < 100) return false;

        // Check for collision
        if (distance < minDistance * 0.9) { // Using 0.8 as a factor for better visual results
            this.lastCollisionTime = now;
            return true;
        }

        return false;
    }

    // Handle collision response between this object and another object
    resolveCollision(other) {
        // Direction from other to this
        const collisionNormal = new THREE.Vector3().subVectors(
            this.mesh.position,
            other.mesh.position
        ).normalize();

        // Calculate relative velocity
        const relativeVelocity = new THREE.Vector3().subVectors(
            this.velocity,
            other.velocity
        );

        // Calculate relative velocity along the normal
        const velAlongNormal = relativeVelocity.dot(collisionNormal);

        // If objects are moving away from each other, no need to resolve collision
        if (velAlongNormal > 0) return;

        // Calculate impulse scalar
        const e = COLLISION_ELASTICITY; // Coefficient of restitution
        const j = -(1 + e) * velAlongNormal;
        const j_div_2 = j / 2; // Split impulse equally (assuming equal masses)

        // Apply impulse
        const impulse = collisionNormal.clone().multiplyScalar(j_div_2);
        this.velocity.add(impulse);
        other.velocity.sub(impulse);

        // Position correction to prevent objects from getting stuck inside each other
        const penetrationDepth = (this.size + other.size) - this.mesh.position.distanceTo(other.mesh.position);
        if (penetrationDepth > 0) {
            const correction = collisionNormal.clone().multiplyScalar(penetrationDepth * 0.6);
            this.mesh.position.add(correction);
            other.mesh.position.sub(correction);
        }

        // Add some random spin variation on collision
        this.angularVelocity.add(new THREE.Vector3(
            (Math.random() - 0.5) * 1,
            (Math.random() - 0.5) * 1,
            (Math.random() - 0.5) * 1
        ));
        other.angularVelocity.add(new THREE.Vector3(
            (Math.random() - 0.5) * 1,
            (Math.random() - 0.5) * 1,
            (Math.random() - 0.5) * 1
        ));
    }

    setPosition(position) {
        if (this.isHeld) {
            this.mesh.position.copy(position);
        }
    }

    update(deltaTime, handPosition = null) {
        if (this.isHeld && handPosition) {
            this.mesh.position.lerp(handPosition, 0.8); // Smooth follow
            this.velocity.set(0, 0, 0); // Stop physics movement while held
            this.angularVelocity.set(0, 0, 0);
        } else if (!this.isHeld) {
            // Apply gravity
            this.velocity.addScaledVector(GRAVITY, deltaTime);

            // Update position
            this.mesh.position.addScaledVector(this.velocity, deltaTime);

            // Update rotation
            this.mesh.rotation.x += this.angularVelocity.x * deltaTime;
            this.mesh.rotation.y += this.angularVelocity.y * deltaTime;
            this.mesh.rotation.z += this.angularVelocity.z * deltaTime;

            // Apply damping
            this.velocity.multiplyScalar(DAMPING_FACTOR);
            this.angularVelocity.multiplyScalar(ANGULAR_DAMPING_FACTOR);

            // Simple ground collision and bounce
            if (this.mesh.position.y < GROUND_Y) {
                this.mesh.position.y = GROUND_Y;
                this.velocity.y *= -0.5; // Bounce with energy loss
                // Friction for horizontal movement on ground
                this.velocity.x *= 0.8;
                this.velocity.z *= 0.8;
                this.angularVelocity.multiplyScalar(0.8); // Friction for spin
            }

            // Boundary checks to keep objects in playable area
            // Boundary checks to keep objects in playable area
            const BOUND_X = 10; // Changed from Ó10 to 10
            const BOUND_Z = 10;

            if (Math.abs(this.mesh.position.x) > BOUND_X) {
                this.mesh.position.x = Math.sign(this.mesh.position.x) * BOUND_X;
                this.velocity.x *= -0.5; // Bounce off boundary
            }

            if (Math.abs(this.mesh.position.z) > BOUND_Z) {
                this.mesh.position.z = Math.sign(this.mesh.position.z) * BOUND_Z;
                this.velocity.z *= -0.5; // Bounce off boundary
            }
        }
    }
}