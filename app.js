// create audio api context
var audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// create 3 x osc node
var osc1 = audioCtx.createOscillator();
var osc2 = audioCtx.createOscillator();
var osc3 = audioCtx.createOscillator();

// marshall stack / FX
var analyser = audioCtx.createAnalyser();
var distortion = audioCtx.createWaveShaper();
var gainNode = audioCtx.createGain();
var biquadFilter = audioCtx.createBiquadFilter();
var convolver = audioCtx.createConvolver();

var freqValue = 50;
var xValue = 0;
var yValue = 0;
var rotation = 0;

var duck = document.getElementById("imgLogo");

if (location.protocol != "https:") {
  location.href = "https:" + window.location.href.substring(window.location.protocol.length);
}

function startOscillators() {
    osc1.type = 'square';
    osc2.type = 'sine';
    osc3.type = 'triangle';

    osc1.frequency.value = freqValue;
    osc2.frequency.value = freqValue;
    osc3.frequency.value = freqValue;

    osc1.connect(distortion);
    osc2.connect(distortion);
    osc3.connect(gainNode);
    gainNode.connect(convolver);
    convolver.connect(audioCtx.destination);

    osc1.start();
    osc2.start();
    osc3.start();
}

function permission() {
    if (typeof (DeviceMotionEvent) !== "undefined" && typeof (DeviceMotionEvent.requestPermission) === "function") {
        DeviceMotionEvent.requestPermission()
            .then(response => {
                if (response == "granted") {
                    window.addEventListener("deviceorientation", function (event) {
                        xValue = Math.round(event.gamma);
                        yValue = Math.round(event.beta);
                        rotation = Math.round(event.alpha);

                        document.getElementById("doTiltLR").innerHTML = Math.round(xValue);
                        document.getElementById("doTiltFB").innerHTML = Math.round(yValue);
                        document.getElementById("doDirection").innerHTML = Math.round(rotation);

                        duck.style.transform =
                            "rotate(" + xValue + "deg) rotate3d(1,0,0, " + (yValue * -1) + "deg)";

                        osc1.detune.value = freqValue * (xValue * 0.1);
                        osc2.detune.value = freqValue * (yValue * 0.1);
                        osc3.detune.value = freqValue * (rotation * 0.1);
                    }, true);
                }
            })
            .catch(console.error);
    } else {
        alert("DeviceMotionEvent is not defined");
    }
}

function makeDistortionCurve(amount) {
    var k = typeof amount === 'number' ? amount : 50,
        n_samples = 44100,
        curve = new Float32Array(n_samples),
        deg = Math.PI / 180,
        i = 0,
        x;
    for (; i < n_samples; ++i) {
        x = i * 2 / n_samples - 1;
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
};

duck.addEventListener('click', function (event) {
    permission();
    startOscillators();
});

distortion.curve = makeDistortionCurve(800);
distortion.oversample = '2x';
