let audioCtx = null;
let masterGain, distortion;
let isPlaying = false;

let baseFreq = 50; // Starting frequency
let freqMultiplier = 1; // Frequency range multiplier
let currentMode = 'noise'; // Current mode: noise, dream, or glitch
let xValue = 0;
let yValue = 0;
let rotation = 0;

// Effect nodes
let compressor = null;
let foldingDistortion = null;

// Dream mode effects
let highpassFilter = null;
let dreamReverb = null;
let stereoWidener = null;
let stereoDelay = null;

// Glitch mode effects
let notchFilter = null;
let ringModOsc = null;
let ringModGain = null;
let bitcrusher = null;

// Granular synthesis for glitch mode
let grainBuffer = null;
let grainRecorder = null;
let grainRecorderGain = null;
let grainInterval = null;
let grainSize = 0.05; // 50ms grains
let grainDensity = 100; // Spawn grain every 100ms
let grainJitter = 0.5; // How random the playback position is (0-1)

const oscillatorSets = [];
const duck = document.getElementById("imgLogo");
const addButton = document.getElementById("addOscillators");
const oscCountDisplay = document.getElementById("oscCount");
const distortionSlider = document.getElementById("distortionSlider");
const distortionValueDisplay = document.getElementById("distortionValue");
const bitDepthSlider = document.getElementById("bitDepthSlider");
const bitDepthValueDisplay = document.getElementById("bitDepthValue");

if (location.protocol != "https:") {
  location.href = "https:" + window.location.href.substring(window.location.protocol.length);
}

function makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;

    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1;
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

function makeFoldingCurve() {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);

    for (let i = 0; i < n_samples; ++i) {
        let x = i * 2 / n_samples - 1;
        // Folding distortion - wraps signal that exceeds threshold
        x = x * 3; // Pre-gain
        while (x > 1) x = 2 - x;
        while (x < -1) x = -2 - x;
        curve[i] = x * 0.7; // Post-gain
    }
    return curve;
}

function makeBitcrushCurve(bits) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const levels = Math.pow(2, bits);

    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1;
        // Quantize to specific bit depth
        curve[i] = Math.round(x * levels) / levels;
    }
    return curve;
}

// Granular synthesis functions
function playGrain() {
    if (!grainBuffer || !audioCtx) return;

    const grain = audioCtx.createBufferSource();
    const grainGain = audioCtx.createGain();

    grain.buffer = grainBuffer;

    // Random position in buffer with jitter
    const bufferDuration = grainBuffer.duration;
    const maxOffset = Math.max(0, bufferDuration - grainSize);
    const randomOffset = Math.random() * grainJitter;
    const position = maxOffset * randomOffset;

    // Random pitch variation
    const pitchVariation = 0.95 + Math.random() * 0.1; // ±5% pitch
    grain.playbackRate.value = pitchVariation;

    // Envelope for grain (fade in/out to avoid clicks)
    const now = audioCtx.currentTime;
    const attackTime = grainSize * 0.1;
    const releaseTime = grainSize * 0.1;

    grainGain.gain.setValueAtTime(0, now);
    grainGain.gain.linearRampToValueAtTime(0.3, now + attackTime);
    grainGain.gain.setValueAtTime(0.3, now + grainSize - releaseTime);
    grainGain.gain.linearRampToValueAtTime(0, now + grainSize);

    // Connect and play
    grain.connect(grainGain);
    grainGain.connect(compressor);

    grain.start(now, position, grainSize);
    grain.stop(now + grainSize);
}

function startGrainScheduler() {
    if (grainInterval) {
        clearInterval(grainInterval);
    }

    grainInterval = setInterval(() => {
        if (currentMode === 'glitch') {
            playGrain();
        }
    }, grainDensity);

    console.log("Grain scheduler started");
}

function stopGrainScheduler() {
    if (grainInterval) {
        clearInterval(grainInterval);
        grainInterval = null;
        console.log("Grain scheduler stopped");
    }
}

function createOscillatorSet(detuneOffset = 0) {
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const osc3 = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    // Oscillators are the same for all modes
    osc1.type = 'square';
    osc2.type = 'sine';
    osc3.type = 'triangle';

    osc1.frequency.value = baseFreq;
    osc2.frequency.value = baseFreq;
    osc3.frequency.value = baseFreq;

    osc1.detune.value = detuneOffset;
    osc2.detune.value = detuneOffset;
    osc3.detune.value = detuneOffset;

    // Lower gain per set as we add more
    const numSets = oscillatorSets.length + 1;
    gainNode.gain.value = 0.3 / Math.sqrt(numSets);

    // Connect oscillators to set's gain node
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    osc3.connect(gainNode);

    // Connect set's gain to master gain
    gainNode.connect(masterGain);

    osc1.start();
    osc2.start();
    osc3.start();

    return { osc1, osc2, osc3, gainNode, detuneOffset };
}

function updateOscillatorCount() {
    oscCountDisplay.textContent = `Active oscillator sets: ${oscillatorSets.length} (${oscillatorSets.length * 3} oscillators)`;
}

function addOscillatorSet() {
    if (!isPlaying) return;

    // Create detune offset - more detuned as we add more sets
    const baseDetune = oscillatorSets.length * 15;
    const randomVariation = (Math.random() - 0.5) * 30;
    const detuneOffset = baseDetune + randomVariation;

    const newSet = createOscillatorSet(detuneOffset);
    oscillatorSets.push(newSet);

    console.log(`Added oscillator set ${oscillatorSets.length} with detune offset: ${detuneOffset.toFixed(1)}`);
    updateOscillatorCount();
}

function startOscillators() {
    console.log("Starting oscillators...");

    if (isPlaying) {
        console.log("Already playing!");
        return;
    }

    // Create audio context on user interaction
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        console.log("Created new AudioContext");
    }

    console.log("Audio context state:", audioCtx.state);

    // Resume audio context (required on iOS)
    audioCtx.resume().then(() => {
        console.log("Audio context resumed, state:", audioCtx.state);

        masterGain = audioCtx.createGain();

        // Create compressor (used by all modes)
        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.knee.value = 10;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        // NOISE MODE: Folding distortion
        foldingDistortion = audioCtx.createWaveShaper();
        foldingDistortion.curve = makeFoldingCurve();
        foldingDistortion.oversample = '4x';

        // DREAM MODE: Highpass + Reverb + Stereo Widener
        highpassFilter = audioCtx.createBiquadFilter();
        highpassFilter.type = 'highpass';
        highpassFilter.frequency.value = 100;
        highpassFilter.Q.value = 0.9;

        dreamReverb = audioCtx.createConvolver();
        const reverbLength = audioCtx.sampleRate * 5; // 3 second reverb
        const reverbBuffer = audioCtx.createBuffer(2, reverbLength, audioCtx.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const channelData = reverbBuffer.getChannelData(channel);
            for (let i = 0; i < reverbLength; i++) {
                channelData[i] = (Math.random() * 2 - 1) * (1 - i / reverbLength) ** 2;
            }
        }
        dreamReverb.buffer = reverbBuffer;

        // Stereo widener using delay
        stereoDelay = audioCtx.createDelay();
        stereoDelay.delayTime.value = 0.02; // 20ms for Haas effect
        stereoWidener = audioCtx.createChannelSplitter(2);

        // GLITCH MODE: Notch filter + Ring mod + Bitcrusher
        notchFilter = audioCtx.createBiquadFilter();
        notchFilter.type = 'notch';
        notchFilter.frequency.value = 1000;
        notchFilter.Q.value = 10;

        ringModOsc = audioCtx.createOscillator();
        ringModOsc.frequency.value = 800;
        ringModOsc.type = 'sine';
        ringModOsc.start();

        ringModGain = audioCtx.createGain();
        ringModGain.gain.value = 0;

        // Global bitcrusher (used by all modes)
        bitcrusher = audioCtx.createWaveShaper();
        bitcrusher.curve = makeBitcrushCurve(16); // Start at 16-bit (no crushing)

        // Set up grain recording buffer (1 second circular buffer)
        grainBuffer = audioCtx.createBuffer(3, audioCtx.sampleRate * 3, audioCtx.sampleRate);

        // Create a delay node to act as circular buffer for recording
        grainRecorder = audioCtx.createDelay(3.0);
        grainRecorder.delayTime.value = 3.0;

        grainRecorderGain = audioCtx.createGain();
        grainRecorderGain.gain.value = 0; // Silent - just for recording

        // Tap the signal for grain recording
        masterGain.connect(grainRecorderGain);
        grainRecorderGain.connect(grainRecorder);

        // Set up ScriptProcessor to continuously record into grain buffer
        const scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
        let writeIndex = 0;
        const grainBufferData = grainBuffer.getChannelData(0);

        scriptNode.onaudioprocess = function(audioProcessingEvent) {
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);

            // Copy input to circular grain buffer
            for (let i = 0; i < inputData.length; i++) {
                grainBufferData[writeIndex] = inputData[i];
                writeIndex = (writeIndex + 1) % grainBufferData.length;
            }
        };

        // Connect recorder (silent tap)
        grainRecorderGain.connect(scriptNode);
        scriptNode.connect(audioCtx.destination); // Required to keep processing

        // Connect audio graph - will be rewired based on mode
        masterGain.connect(compressor);
        compressor.connect(audioCtx.destination);

        const firstSet = createOscillatorSet(0);
        oscillatorSets.push(firstSet);

        isPlaying = true;

        // Set up the audio graph based on current mode
        rewireAudioGraph();

        updateOscillatorCount();

        duck.style.opacity = '1';
    }).catch(err => {
        console.error("Failed to resume audio context:", err);
        alert("Audio error: " + err.message);
    });
}

function permission() {
    console.log("Permission function called");
    console.log("DeviceOrientationEvent:", typeof DeviceOrientationEvent);
    console.log("requestPermission:", typeof DeviceOrientationEvent.requestPermission);

    if (typeof (DeviceOrientationEvent) !== "undefined" && typeof (DeviceOrientationEvent.requestPermission) === "function") {
        console.log("Requesting iOS permission...");
        DeviceOrientationEvent.requestPermission()
            .then(response => {
                console.log("Permission response:", response);
                if (response === "granted") {
                  startOscillators()
                    window.addEventListener("deviceorientation", (event) => {
                        xValue = Math.round(event.gamma);
                        yValue = Math.round(event.beta);
                        rotation = Math.round(event.alpha);

                        document.getElementById("doTiltLR").innerHTML = Math.round(xValue);
                        document.getElementById("doTiltFB").innerHTML = Math.round(yValue);
                        document.getElementById("doDirection").innerHTML = Math.round(rotation);

                        duck.style.transform =
                            "rotate(" + xValue + "deg) rotate3d(1,0,0, " + (yValue * -1) + "deg)";

                        // Update all oscillator sets
                        oscillatorSets.forEach(set => {
                            set.osc1.detune.value = set.detuneOffset + baseFreq * freqMultiplier * (xValue * 0.1);
                            set.osc2.detune.value = set.detuneOffset + baseFreq * freqMultiplier * (yValue * 0.1);
                            set.osc3.detune.value = set.detuneOffset + baseFreq * freqMultiplier * (rotation * 0.1);
                        });

                        // Mode-specific effect controls
                        if (currentMode === 'dream') {
                            // DREAM MODE controls
                            if (highpassFilter) {
                                // Gamma (xValue) controls highpass filter frequency (50Hz to 800Hz)
                                const hpFreq = 50 + Math.abs(xValue / 90) * 750;
                                highpassFilter.frequency.value = Math.max(50, Math.min(800, hpFreq));
                            }
                            if (stereoDelay) {
                                // Beta (yValue) controls stereo delay time (5ms to 50ms)
                                const delayTime = 0.005 + Math.abs(yValue / 90) * 0.045;
                                stereoDelay.delayTime.value = Math.max(0.005, Math.min(0.05, delayTime));
                            }
                        } else if (currentMode === 'glitch') {
                            // GLITCH MODE controls
                            if (notchFilter) {
                                const notchFreq = 200 + Math.abs(xValue / 90) * 2800;
                                notchFilter.frequency.value = Math.max(200, Math.min(3000, notchFreq));
                            }
                            if (ringModOsc) {
                                const ringFreq = 200 + Math.abs(yValue / 90) * 600;
                                ringModOsc.frequency.value = ringFreq;
                            }
                            // Rotation (alpha) controls grain size (10ms to 200ms)
                            const normalizedRotation = (rotation % 360) / 360;
                            grainSize = 0.01 + normalizedRotation * 0.19;
                            // Bitcrusher now controlled by global slider
                        }
                    }, true);
                }
            })
            .catch(err => {
                console.error("Permission error:", err);
                alert("Permission denied or error: " + err);
            });
    } else {
        // For non-iOS devices, start oscillators and add listener directly
        console.log("Non-iOS device detected, starting directly");
        startOscillators()
        window.addEventListener("deviceorientation", (event) => {
            xValue = Math.round(event.gamma);
            yValue = Math.round(event.beta);
            rotation = Math.round(event.alpha);

            document.getElementById("doTiltLR").innerHTML = Math.round(xValue);
            document.getElementById("doTiltFB").innerHTML = Math.round(yValue);
            document.getElementById("doDirection").innerHTML = Math.round(rotation);

            duck.style.transform =
                "rotate(" + xValue + "deg) rotate3d(1,0,0, " + (yValue * -1) + "deg)";

            // Update all oscillator sets
            oscillatorSets.forEach(set => {
                // All modes use standard detune
                set.osc1.detune.value = set.detuneOffset + baseFreq * freqMultiplier * (xValue * 0.1);
                set.osc2.detune.value = set.detuneOffset + baseFreq * freqMultiplier * (yValue * 0.1);
                set.osc3.detune.value = set.detuneOffset + baseFreq * freqMultiplier * (rotation * 0.1);
            });

            // Mode-specific effect controls
            if (currentMode === 'dream') {
                // DREAM MODE controls
                if (highpassFilter) {
                    // Gamma (xValue) controls highpass filter frequency (50Hz to 800Hz)
                    const hpFreq = 50 + Math.abs(xValue / 90) * 750;
                    highpassFilter.frequency.value = Math.max(50, Math.min(800, hpFreq));
                }
                if (stereoDelay) {
                    // Beta (yValue) controls stereo delay time (5ms to 50ms)
                    const delayTime = 0.005 + Math.abs(yValue / 90) * 0.045;
                    stereoDelay.delayTime.value = Math.max(0.005, Math.min(0.05, delayTime));
                }
            } else if (currentMode === 'glitch') {
                // GLITCH MODE controls
                if (notchFilter) {
                    // Gamma (xValue) controls notch filter frequency (200Hz to 3000Hz)
                    const notchFreq = 200 + Math.abs(xValue / 90) * 2800;
                    notchFilter.frequency.value = Math.max(200, Math.min(3000, notchFreq));
                }

                if (ringModOsc) {
                    // Beta (yValue) modulates ring mod frequency
                    const ringFreq = 200 + Math.abs(yValue / 90) * 600;
                    ringModOsc.frequency.value = ringFreq;
                }

                // Rotation (alpha) controls grain size (10ms to 200ms)
                const normalizedRotation = (rotation % 360) / 360;
                grainSize = 0.01 + normalizedRotation * 0.19;

                // Bitcrusher is now controlled by global slider, not rotation
            }
        }, true);
    }
}

duck.addEventListener('click', () => {
    permission();
});

addButton.addEventListener('click', (e) => {
    e.preventDefault();
    addOscillatorSet();
});

distortionSlider.addEventListener('input', function() {
    const distortionAmount = parseInt(this.value);
    distortionValueDisplay.textContent = distortionAmount;

    if (distortion) {
        distortion.curve = makeDistortionCurve(distortionAmount);
        console.log("Distortion updated to:", distortionAmount);
    }
});

bitDepthSlider.addEventListener('input', function() {
    const bits = parseInt(this.value);
    bitDepthValueDisplay.textContent = bits + "-bit";

    if (bitcrusher) {
        bitcrusher.curve = makeBitcrushCurve(bits);
        console.log("Bit depth updated to:", bits);
    }
});

// Rewire audio graph based on mode
function rewireAudioGraph() {
    if (!masterGain || !compressor) return;

    try {
        // Disconnect everything
        masterGain.disconnect();
        compressor.disconnect();
        foldingDistortion.disconnect();
        highpassFilter.disconnect();
        dreamReverb.disconnect();
        stereoDelay.disconnect();
        notchFilter.disconnect();
        ringModGain.disconnect();
        bitcrusher.disconnect();
    } catch (e) {
        // Ignore disconnect errors on first run
    }

    if (currentMode === 'noise') {
        // NOISE MODE: masterGain → folding distortion → bitcrusher → compressor → destination
        masterGain.connect(foldingDistortion);
        foldingDistortion.connect(bitcrusher);
        bitcrusher.connect(compressor);
        compressor.connect(audioCtx.destination);

        masterGain.gain.value = 1.0;
        console.log("Switched to NOISE mode");

    } else if (currentMode === 'dream') {
        // DREAM MODE: masterGain → highpass → reverb → bitcrusher → compressor → destination
        // with stereo widening
        masterGain.connect(highpassFilter);
        highpassFilter.connect(dreamReverb);

        // Stereo widening: split signal, delay one channel slightly
        dreamReverb.connect(stereoDelay);
        stereoDelay.connect(bitcrusher);
        dreamReverb.connect(bitcrusher); // Dry signal

        bitcrusher.connect(compressor);
        compressor.connect(audioCtx.destination);

        masterGain.gain.value = 0.6;
        console.log("Switched to DREAM mode");

    } else if (currentMode === 'glitch') {
        // GLITCH MODE: masterGain → notch filter → ring mod → bitcrusher → compressor → destination
        masterGain.connect(notchFilter);

        // Ring modulation: multiply signal by oscillator
        notchFilter.connect(ringModGain);
        ringModOsc.connect(ringModGain.gain); // Modulate the gain

        ringModGain.connect(bitcrusher);
        bitcrusher.connect(compressor);
        compressor.connect(audioCtx.destination);

        masterGain.gain.value = 0.7;
        console.log("Switched to GLITCH mode");
    }
}

// Update color scheme based on mode
function updateColorScheme(mode) {
    const root = document.documentElement;

    if (mode === 'noise') {
        // Original vaporwave colors
        root.style.setProperty('--primary-color', '#FF5DB1');
        root.style.setProperty('--secondary-color', '#36BBCC');
        root.style.setProperty('--accent-color', '#FFEF77');
        root.style.setProperty('--bg-color', '#262626');
    } else if (mode === 'dream') {
        // Soft pastel dream colors
        root.style.setProperty('--primary-color', '#B19CD9');
        root.style.setProperty('--secondary-color', '#9DD9D2');
        root.style.setProperty('--accent-color', '#FFD9E8');
        root.style.setProperty('--bg-color', '#1A1A2E');
    } else if (mode === 'glitch') {
        // Matrix/cyber glitch colors
        root.style.setProperty('--primary-color', '#00FF00');
        root.style.setProperty('--secondary-color', '#00FFFF');
        root.style.setProperty('--accent-color', '#FF00FF');
        root.style.setProperty('--bg-color', '#000000');
    }
}

// Mode button handlers
document.querySelectorAll('.mode-button').forEach(button => {
    button.addEventListener('click', function(e) {
        e.preventDefault();

        document.querySelectorAll('.mode-button').forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');

        currentMode = this.getAttribute('data-mode');
        updateColorScheme(currentMode);
        rewireAudioGraph();

        // Start/stop grain scheduler based on mode
        if (currentMode === 'glitch') {
            startGrainScheduler();
        } else {
            stopGrainScheduler();
        }

        console.log(`Mode changed to: ${currentMode}`);
    });
});

document.querySelectorAll('.freq-button').forEach(button => {
    button.addEventListener('click', function(e) {
        e.preventDefault();

        document.querySelectorAll('.freq-button').forEach(btn => btn.classList.remove('active'));

        // Add active class to clicked button
        this.classList.add('active');

        // Update frequency multiplier based on selected range
        const range = this.getAttribute('data-range');
        switch(range) {
            case 'low':
                freqMultiplier = 1;
                baseFreq = 50;
                break;
            case 'mid':
                freqMultiplier = 2.5;
                baseFreq = 50;
                break;
            case 'full':
                freqMultiplier = 8;
                baseFreq = 50;
                break;
        }

        // Update all oscillator frequencies
        oscillatorSets.forEach(set => {
            set.osc1.frequency.value = baseFreq;
            set.osc2.frequency.value = baseFreq;
            set.osc3.frequency.value = baseFreq;
        });

        console.log(`Frequency range changed to: ${range}, multiplier: ${freqMultiplier}`);
    });
});
