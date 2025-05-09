import * as THREE from 'three';

const GRAVITY = new THREE.Vector3(0, -9.81, 0);
const GROUND_Y = 0.001; // Y position of the ground
const DAMPING_FACTOR = 0.98; // For velocity decay
const ANGULAR_DAMPING_FACTOR = 0.95;
const COLLISION_ELASTICITY = 0.7; // How bouncy collisions between balls are (0-1)
const BALL_RADIUS = 0.25; // Half of the original CUBE_SIZE for equivalent volume

export class PhysicsObject {
    constructor(mesh, initialPosition) {
        this.mesh = mesh;
        this.mesh.castShadow = true;
        this.mesh.position.copy(initialPosition);

        // Ensure the object starts above the ground
        if (this.mesh.position.y < GROUND_Y + BALL_RADIUS) {
            this.mesh.position.y = GROUND_Y + BALL_RADIUS + 0.02;
        }

        this.velocity = new THREE.Vector3();
        this.angularVelocity = new THREE.Vector3();
        this.isHeld = false;
        this.radius = BALL_RADIUS; // Radius of the ball for collision detection
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
        
        // Add some random spin - slightly reduced for ball physics
        this.angularVelocity.set(
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4
        );
    }

    // Check if this object collides with another object
    checkCollision(other) {
        // Skip if either object is held
        if (this.isHeld || other.isHeld) return false;

        // For balls, we use the sum of radii
        const minDistance = this.radius + other.radius;
        const distance = this.mesh.position.distanceTo(other.mesh.position);

        // Skip very recent collisions (avoids multiple detections in one collision)
        const now = performance.now();
        if (now - this.lastCollisionTime < 100) return false;

        // Check for collision
        if (distance < minDistance) {
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
        const penetrationDepth = (this.radius + other.radius) - this.mesh.position.distanceTo(other.mesh.position);
        if (penetrationDepth > 0) {
            const correction = collisionNormal.clone().multiplyScalar(penetrationDepth * 0.6);
            this.mesh.position.add(correction);
            other.mesh.position.sub(correction);
        }

        // Add some random spin variation on collision - reduced for spheres
        this.angularVelocity.add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 0.8
        ));
        other.angularVelocity.add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 0.8
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

            // Update rotation - for a ball, rotation is more visual than functional
            this.mesh.rotation.x += this.angularVelocity.x * deltaTime;
            this.mesh.rotation.y += this.angularVelocity.y * deltaTime;
            this.mesh.rotation.z += this.angularVelocity.z * deltaTime;

            // Apply damping
            this.velocity.multiplyScalar(DAMPING_FACTOR);
            this.angularVelocity.multiplyScalar(ANGULAR_DAMPING_FACTOR);

            // Ground collision and bounce - using radius for ball
            if (this.mesh.position.y < GROUND_Y + this.radius) {
                this.mesh.position.y = GROUND_Y + this.radius;
                this.velocity.y *= -0.5; // Bounce with energy loss
                
                // Rolling friction for horizontal movement on ground - less than for cubes
                this.velocity.x *= 0.9;
                this.velocity.z *= 0.9;
                
                // Calculate rolling motion for the ball
                // For a rolling ball, angular velocity should relate to linear velocity
                const rollAxis = new THREE.Vector3(-this.velocity.z, 0, this.velocity.x).normalize();
                const rollSpeed = this.velocity.length() / this.radius;
                
                if (rollAxis.length() > 0.01) { // Only if there's significant horizontal movement
                    this.angularVelocity = rollAxis.multiplyScalar(rollSpeed);
                } else {
                    this.angularVelocity.multiplyScalar(0.9); // Just slow down the spin
                }
            }

            // Boundary checks to keep objects in playable area
            const BOUND_X = 10;
            const BOUND_Z = 10;

            if (Math.abs(this.mesh.position.x) > BOUND_X - this.radius) {
                this.mesh.position.x = Math.sign(this.mesh.position.x) * (BOUND_X - this.radius);
                this.velocity.x *= -0.5; // Bounce off boundary
            }

            if (Math.abs(this.mesh.position.z) > BOUND_Z - this.radius) {
                this.mesh.position.z = Math.sign(this.mesh.position.z) * (BOUND_Z - this.radius);
                this.velocity.z *= -0.5; // Bounce off boundary
            }
        }
    }
}