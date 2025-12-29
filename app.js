let audioCtx = null;
let masterGain, distortion;
let isPlaying = false;

let baseFreq = 50; // Starting frequency
let freqMultiplier = 1; // Frequency range multiplier
let xValue = 0;
let yValue = 0;
let rotation = 0;

const oscillatorSets = [];
const duck = document.getElementById("imgLogo");
const addButton = document.getElementById("addOscillators");
const oscCountDisplay = document.getElementById("oscCount");
const distortionSlider = document.getElementById("distortionSlider");
const distortionValueDisplay = document.getElementById("distortionValue");
const oversampleSlider = document.getElementById("oversampleSlider");
const oversampleValueDisplay = document.getElementById("oversampleValue");

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

function createOscillatorSet(detuneOffset = 0) {
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const osc3 = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    // Configure oscillators
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
        distortion = audioCtx.createWaveShaper();

        distortion.curve = makeDistortionCurve(400);
        distortion.oversample = '2x';

        // Connect audio graph
        masterGain.connect(distortion);
        distortion.connect(audioCtx.destination);

        const firstSet = createOscillatorSet(0);
        oscillatorSets.push(firstSet);

        isPlaying = true;

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
                set.osc1.detune.value = set.detuneOffset + baseFreq * freqMultiplier * (xValue * 0.1);
                set.osc2.detune.value = set.detuneOffset + baseFreq * freqMultiplier * (yValue * 0.1);
                set.osc3.detune.value = set.detuneOffset + baseFreq * freqMultiplier * (rotation * 0.1);
            });
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

oversampleSlider.addEventListener('input', function() {
    const oversampleLevel = parseInt(this.value);
    const oversampleOptions = ['none', '2x', '4x'];
    const oversampleValue = oversampleOptions[oversampleLevel];

    oversampleValueDisplay.textContent = oversampleValue;

    if (distortion) {
        distortion.oversample = oversampleValue;
        console.log("Oversample updated to:", oversampleValue);
    }
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
