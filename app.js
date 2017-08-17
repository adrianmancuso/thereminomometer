// create audio api context
var audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// create Osc node
var osc1 = audioCtx.createOscillator();
var osc2 = audioCtx.createOscillator();
var osc3 = audioCtx.createOscillator();

var analyser = audioCtx.createAnalyser();
var distortion = audioCtx.createWaveShaper();
var gainNode = audioCtx.createGain();
var biquadFilter = audioCtx.createBiquadFilter();
var convolver = audioCtx.createConvolver();

var freqValue = 100;
var xValue = 0;
var yValue = 0;
var rotation = 0;

var duck = document.getElementById("imgLogo");


if(window.DeviceOrientationEvent) {

  window.addEventListener("deviceorientation", function(event) {
      
      xValue = Math.round(event.gamma);
      yValue = Math.round(event.beta);
      rotation = Math.round(event.alpha);

      document.getElementById("doTiltLR").innerHTML = Math.round(xValue);
      document.getElementById("doTiltFB").innerHTML = Math.round(yValue);
      document.getElementById("doDirection").innerHTML = Math.round(rotation);

      duck.style.webkitTransform =
        "rotate("+ xValue +"deg) rotate3d(1,0,0, "+ (yValue*-1)+"deg)";
      duck.style.MozTransform = "rotate("+ xValue +"deg)";
      duck.style.transform =
        "rotate("+ xValue +"deg) rotate3d(1,0,0, "+ (yValue*-1)+"deg)";


      osc1.type = 'square';
      osc1.frequency.value = freqValue;
      osc1.connect(distortion);
      distortion.connect(audioCtx.destination);
      osc1.start();

      osc2.type = 'sine';
      osc2.frequency.value = freqValue;
      osc2.connect(distortion);
      distortion.connect(audioCtx.destination);
      osc2.start();

      osc3.type = 'sawtooth';
      osc3.frequency.value = freqValue;
      osc3.connect(distortion);
      distortion.connect(gainNode);
      gainNode.connect(biquadFilter);
      biquadFilter.connect(convolver);
      convolver.connect(audioCtx.destination);
      osc3.start();

      biquadFilter.type = "lowpass";
      biquadFilter.frequency.value = 1000;
      biquadFilter.gain.value = 25;

  }, true);
} else {
  alert("Sucked in, your browser doesn't support Device Orientation");
}

function makeDistortionCurve(amount) {
  var k = typeof amount === 'number' ? amount : 50,
    n_samples = 44100,
    curve = new Float32Array(n_samples),
    deg = Math.PI / 180,
    i = 0,
    x;
  for ( ; i < n_samples; ++i ) {
    x = i * 2 / n_samples - 1;
    curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) );
  }
  return curve;
};

duck.addEventListener('click', function(event) {
  osc1.start();
  osc2.start();
  osc3.start();
});

distortion.curve = makeDistortionCurve(800);
distortion.oversample = '2x';

window.addEventListener("deviceorientation", function(event) {
  osc1.frequency.value = freqValue * (xValue*0.2);
  biquadFilter.frequency.value = 1000 * (xValue/0.1);
  osc2.frequency.value = freqValue * (yValue*0.2);
  osc3.frequency.value = freqValue * (rotation/0.2);
});