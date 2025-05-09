import * as THREE from 'three';
import { HandLandmarker, FilesetResolver } from 'https://esm.sh/@mediapipe/tasks-vision@0.10.14';

const GRAB_GESTURE_THRESHOLD = 0.07; // Normalized screen distance for pinch

export class HandTracker {
    constructor() {
        this.handLandmarker = null;
        this.videoElement = null;
        this.lastVideoTime = -1;
        this.handData = {
            landmarks: null,
            worldLandmarks: null,
            handedness: null,
            isGrabbing: false,
            screenPosition: new THREE.Vector2(0.5, 0.5), // Default to center
        };
        this.camera = null; // Reference to THREE.Camera for projections
        this.prevScreenPosition = new THREE.Vector2(0.5, 0.5);
        this.handMovement = new THREE.Vector2(0, 0);
    }

    async init(threeCamera) {
        this.camera = threeCamera;
        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numHands: 1
        });

        this.videoElement = document.createElement('video');
        this.videoElement.autoplay = true;
        this.videoElement.style.display = 'none'; // Hide video element
        document.body.appendChild(this.videoElement);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            this.videoElement.srcObject = stream;
            await new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => resolve();
            });
            console.log("Webcam stream started.");
        } catch (error) {
            console.error("Error accessing webcam:", error);
            alert("Error accessing webcam. Please ensure permissions are granted and no other app is using it.");
            throw error; // Propagate error to stop game init
        }
    }

    update() {
        if (!this.handLandmarker || !this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
            return;
        }

        const videoTime = this.videoElement.currentTime;
        if (videoTime !== this.lastVideoTime) {
            this.lastVideoTime = videoTime;
            const results = this.handLandmarker.detectForVideo(this.videoElement, performance.now());

            if (results.landmarks && results.landmarks.length > 0) {
                const landmarks = results.landmarks[0]; // First hand
                this.handData.landmarks = landmarks;
                this.handData.worldLandmarks = results.worldLandmarks[0];
                this.handData.handedness = results.handedness[0];


                const indexTip = landmarks[8]; // INDEX_FINGER_TIP
                this.prevScreenPosition.copy(this.handData.screenPosition);
                this.handData.screenPosition.set(
                    1.0 - indexTip.x, // Invert X coordinate (1.0 - x)
                    indexTip.y
                );
                this.handMovement.set(
                    this.handData.screenPosition.x - this.prevScreenPosition.x,
                    this.handData.screenPosition.y - this.prevScreenPosition.y
                );


                // Simple grab gesture: thumb tip (4) close to index finger tip (8)
                const thumbTip = landmarks[4]; // THUMB_TIP
                const distance = Math.sqrt(
                    Math.pow(thumbTip.x - indexTip.x, 2) +
                    Math.pow(thumbTip.y - indexTip.y, 2) +
                    Math.pow(thumbTip.z - indexTip.z, 2) // Z is important for pinch
                );

                this.handData.isGrabbing = distance < GRAB_GESTURE_THRESHOLD;

            } else {
                this.handData.landmarks = null;
                this.handData.worldLandmarks = null;
                this.handData.handedness = null;
                this.handData.isGrabbing = false;
                this.handMovement.set(0, 0);
            }
        }

    }
    // Estimate depth based on hand size and position
    estimateDepth() {
    if (!this.handData.landmarks) return 0.5; // Default mid-depth
    
    // Simple depth estimation using hand size
    // Assumes hand is larger when closer to camera
    if (this.handData.landmarks.length < 5) return 0.5;
    
    // Calculate the average distance between landmarks to estimate hand size
    let totalDistance = 0;
    const points = [0, 5, 9, 13, 17]; // Wrist and finger bases
    let count = 0;
    
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const p1 = this.handData.landmarks[points[i]];
            const p2 = this.handData.landmarks[points[j]];
            const dist = Math.sqrt(
                Math.pow(p1.x - p2.x, 2) + 
                Math.pow(p1.y - p2.y, 2)
            );
            totalDistance += dist;
            count++;
        }
    }
    
    const avgSize = totalDistance / count;
    
    // Normalize to 0-1 range (0 = far, 1 = near)
    // These thresholds might need adjustment based on your camera setup
    const MIN_SIZE = 0.05;
    const MAX_SIZE = 0.3;
    const normalizedDepth = (avgSize - MIN_SIZE) / (MAX_SIZE - MIN_SIZE);
    
    // INVERTED: Return 1 - normalizedDepth so larger hand = closer (0)
    // and smaller hand = farther (1)
    return 1.0 - Math.max(0, Math.min(1, normalizedDepth));
}

    getHandData() {
        return this.handData;
    }
    getHandMovement() {
        return this.handMovement;
    }
}   