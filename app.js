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

// Master reverb effect
let masterReverb = null;
let reverbWet = null;
let reverbDry = null;

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

// Lo-fi degradation effect (sample rate reduction + noise)
let sampleRateReducer = null;
let lofiNoise = null;
let lofiNoiseGain = null;

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
const reverbSlider = document.getElementById("reverbSlider");
const reverbValueDisplay = document.getElementById("reverbValue");

if (location.protocol != "https:") {
  location.href = "https:" + window.location.href.substring(window.location.protocol.length);
}

function makeNoiseCurve(noisePercent) {
    // noisePercent: 0-100, where 0 is clean and 100 is maximum noise/distortion
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);

    // Convert percentage to normalized amount (0 to 1)
    const amount = noisePercent / 100;

    // Combine multiple distortion techniques based on amount
    for (let i = 0; i < n_samples; ++i) {
        let x = i * 2 / n_samples - 1;

        // Add hard clipping (increases with amount)
        const clipThreshold = 1 - (amount * 0.8); // 1.0 to 0.2
        if (Math.abs(x) > clipThreshold) {
            x = Math.sign(x) * clipThreshold;
        }

        // Add waveshaping distortion
        const k = amount * 100; // 0 to 100
        const deg = Math.PI / 180;
        x = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));

        // Add asymmetric distortion (more extreme at higher amounts)
        if (amount > 0.5) {
            const asymmetry = (amount - 0.5) * 2; // 0 to 1
            x = x + asymmetry * x * x * Math.sign(x) * 0.5;
        }

        // Add random noise (increases dramatically at high amounts)
        const noiseAmount = amount * amount * 0.3; // Exponential curve
        x += (Math.random() * 2 - 1) * noiseAmount;

        // Final clipping
        curve[i] = Math.max(-1, Math.min(1, x));
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

function makeLofiCurve(crushAmount) {
    // crushAmount: 1 (clean) to 16 (super crushed)
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);

    // Calculate bit depth based on crush amount (16-bit at 1, 1-bit at 16)
    const bits = 17 - crushAmount;
    const levels = Math.pow(2, bits);

    // Calculate noise/dither amount (0 at clean, high at crushed)
    const noiseAmount = (crushAmount - 1) / 15; // 0 to 1 range

    for (let i = 0; i < n_samples; ++i) {
        let x = i * 2 / n_samples - 1;

        // Add dithering noise (increases with crush amount)
        const dither = (Math.random() * 2 - 1) * noiseAmount * 0.1;
        x += dither;

        // Quantize to specific bit depth
        x = Math.round(x * levels) / levels;

        // Clamp to valid range
        curve[i] = Math.max(-1, Math.min(1, x));
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

        // Create compressor (used by all modes) - extreme settings
        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -20;  // Lower threshold to compress more
        compressor.knee.value = 5;          // Hard knee for aggressive compression
        compressor.ratio.value = 20;        // Maximum ratio for extreme squashing
        compressor.attack.value = 0.7;    // Very fast attack
        compressor.release.value = 0.1;     // Shorter release for pumping effect

        // Create master reverb (used by all modes)
        masterReverb = audioCtx.createConvolver();
        const masterReverbLength = audioCtx.sampleRate * 3; // 3 second reverb
        const masterReverbBuffer = audioCtx.createBuffer(2, masterReverbLength, audioCtx.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const channelData = masterReverbBuffer.getChannelData(channel);
            for (let i = 0; i < masterReverbLength; i++) {
                channelData[i] = (Math.random() * 2 - 1) * (1 - i / masterReverbLength) ** 2;
            }
        }
        masterReverb.buffer = masterReverbBuffer;

        // Create wet/dry gains for reverb mix
        reverbWet = audioCtx.createGain();
        reverbWet.gain.value = 0; // Start at 0% wet
        reverbDry = audioCtx.createGain();
        reverbDry.gain.value = 1; // Start at 100% dry

        // NOISE MODE: Noise/distortion effect
        foldingDistortion = audioCtx.createWaveShaper();
        foldingDistortion.curve = makeNoiseCurve(50); // Start at 50%
        foldingDistortion.oversample = '4x';

        // DREAM MODE: Highpass + Reverb + Stereo Widener
        highpassFilter = audioCtx.createBiquadFilter();
        highpassFilter.type = 'highpass';
        highpassFilter.frequency.value = 100;
        highpassFilter.Q.value = 1;

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
        notchFilter.Q.value = 1;

        ringModOsc = audioCtx.createOscillator();
        ringModOsc.frequency.value = 200;
        ringModOsc.type = 'sine';
        ringModOsc.start();

        ringModGain = audioCtx.createGain();
        ringModGain.gain.value = 0;

        // Global lo-fi degradation (used by all modes)
        // Bitcrusher with combined effects
        bitcrusher = audioCtx.createWaveShaper();
        bitcrusher.curve = makeLofiCurve(1); // Start at 1 (clean, 16-bit)

        // Sample rate reducer using ScriptProcessor
        let lastSample = 0;
        let sampleCounter = 0;
        let sampleHold = 1; // Start at 1 (no reduction)

        sampleRateReducer = audioCtx.createScriptProcessor(4096, 1, 1);
        sampleRateReducer.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            const output = e.outputBuffer.getChannelData(0);

            for (let i = 0; i < input.length; i++) {
                sampleCounter++;
                if (sampleCounter >= sampleHold) {
                    lastSample = input[i];
                    sampleCounter = 0;
                }
                output[i] = lastSample;
            }
        };

        // Noise generator for lo-fi dithering
        lofiNoise = audioCtx.createBufferSource();
        const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) {
            noiseData[i] = Math.random() * 2 - 1;
        }
        lofiNoise.buffer = noiseBuffer;
        lofiNoise.loop = true;
        lofiNoise.start();

        lofiNoiseGain = audioCtx.createGain();
        lofiNoiseGain.gain.value = 0; // Start with no noise
        lofiNoise.connect(lofiNoiseGain);

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
    const noisePercent = parseInt(this.value);
    distortionValueDisplay.textContent = noisePercent + "%";

    if (foldingDistortion) {
        foldingDistortion.curve = makeNoiseCurve(noisePercent);
        console.log("Noise updated to:", noisePercent + "%");
    }
});

bitDepthSlider.addEventListener('input', function() {
    const degradationPercent = parseInt(this.value);
    bitDepthValueDisplay.textContent = degradationPercent + "%";

    if (bitcrusher && sampleRateReducer && lofiNoiseGain) {
        // Convert percentage to crush amount (0% = 1, 100% = 16)
        const crushAmount = 1 + Math.floor(degradationPercent / 100 * 15);

        // Update bitcrusher curve with dithering
        bitcrusher.curve = makeLofiCurve(crushAmount);

        // Calculate sample rate reduction
        // At 0%: sampleHold = 1 (44100 Hz, no reduction)
        // At 100%: sampleHold = 45 (~980 Hz, maximum reduction)
        const sampleHold = Math.floor(1 + (crushAmount - 1) * 2.93);

        // Update the sample hold value in the processor
        sampleRateReducer.onaudioprocess = function(e) {
            const input = e.inputBuffer.getChannelData(0);
            const output = e.outputBuffer.getChannelData(0);
            let lastSample = 0;
            let counter = 0;

            for (let i = 0; i < input.length; i++) {
                counter++;
                if (counter >= sampleHold) {
                    lastSample = input[i];
                    counter = 0;
                }
                output[i] = lastSample;
            }
        };

        // Calculate noise amount (0 to 0.15 at maximum degradation)
        const noiseAmount = degradationPercent / 100 * 0.15;
        lofiNoiseGain.gain.value = noiseAmount;

        const bits = 17 - crushAmount;
        console.log(`Degradation: ${degradationPercent}% (${bits}-bit, sample hold: ${sampleHold}, noise: ${noiseAmount.toFixed(3)})`);
    }
});

reverbSlider.addEventListener('input', function() {
    const reverbAmount = parseInt(this.value);
    reverbValueDisplay.textContent = reverbAmount + "%";

    if (reverbWet && reverbDry) {
        // Convert percentage to 0-1 range
        const wetGain = reverbAmount / 100;
        const dryGain = 1 - wetGain;

        reverbWet.gain.value = wetGain;
        reverbDry.gain.value = dryGain;
        console.log("Reverb updated to:", reverbAmount + "% (wet:", wetGain, "dry:", dryGain + ")");
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
        sampleRateReducer.disconnect();
        lofiNoiseGain.disconnect();
        reverbDry.disconnect();
        reverbWet.disconnect();
        masterReverb.disconnect();
    } catch (e) {
        // Ignore disconnect errors on first run
    }

    if (currentMode === 'noise') {
        // NOISE MODE: masterGain → folding distortion → sample rate reducer → bitcrusher (+noise) → reverb → compressor → destination
        masterGain.connect(foldingDistortion);
        foldingDistortion.connect(sampleRateReducer);
        sampleRateReducer.connect(bitcrusher);

        // Add lo-fi noise to the bitcrusher output
        lofiNoiseGain.connect(bitcrusher);

        // Reverb wet/dry split
        bitcrusher.connect(reverbDry);
        bitcrusher.connect(masterReverb);
        masterReverb.connect(reverbWet);

        reverbDry.connect(compressor);
        reverbWet.connect(compressor);
        compressor.connect(audioCtx.destination);

        masterGain.gain.value = 1.0;
        console.log("Switched to NOISE mode");

    } else if (currentMode === 'dream') {
        // DREAM MODE: masterGain → highpass → dreamReverb → sample rate reducer → bitcrusher (+noise) → reverb → compressor → destination
        // with stereo widening
        masterGain.connect(highpassFilter);
        highpassFilter.connect(dreamReverb);

        // Stereo widening: split signal, delay one channel slightly
        dreamReverb.connect(stereoDelay);
        stereoDelay.connect(sampleRateReducer);
        dreamReverb.connect(sampleRateReducer); // Dry signal

        sampleRateReducer.connect(bitcrusher);

        // Add lo-fi noise to the bitcrusher output
        lofiNoiseGain.connect(bitcrusher);

        // Master reverb wet/dry split
        bitcrusher.connect(reverbDry);
        bitcrusher.connect(masterReverb);
        masterReverb.connect(reverbWet);

        reverbDry.connect(compressor);
        reverbWet.connect(compressor);
        compressor.connect(audioCtx.destination);

        masterGain.gain.value = 1.0;
        console.log("Switched to DREAM mode");

    } else if (currentMode === 'glitch') {
        // GLITCH MODE: masterGain → notch filter → ring mod → sample rate reducer → bitcrusher (+noise) → reverb → compressor → destination
        masterGain.connect(notchFilter);

        // Ring modulation: multiply signal by oscillator
        notchFilter.connect(ringModGain);
        ringModOsc.connect(ringModGain.gain); // Modulate the gain

        ringModGain.connect(sampleRateReducer);
        sampleRateReducer.connect(bitcrusher);

        // Add lo-fi noise to the bitcrusher output
        lofiNoiseGain.connect(bitcrusher);

        // Master reverb wet/dry split
        bitcrusher.connect(reverbDry);
        bitcrusher.connect(masterReverb);
        masterReverb.connect(reverbWet);

        reverbDry.connect(compressor);
        reverbWet.connect(compressor);
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
        // Inverse dream colors - white background
        root.style.setProperty('--primary-color', '#6B4E9C');
        root.style.setProperty('--secondary-color', '#4E9C8F');
        root.style.setProperty('--accent-color', '#9C4E6B');
        root.style.setProperty('--bg-color', '#FFFFFF');
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
                freqMultiplier = 3;
                baseFreq = 50;
                break;
            case 'full':
                freqMultiplier = 10;
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
