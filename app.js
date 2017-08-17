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





if(window.DeviceOrientationEvent) {

  window.addEventListener("deviceorientation", function(event) {
      
      xValue = Math.round(event.gamma);
      yValue = Math.round(event.beta);
      rotation = Math.round(event.alpha);

      document.getElementById("doTiltLR").innerHTML = Math.round(xValue);
      document.getElementById("doTiltFB").innerHTML = Math.round(yValue);
      document.getElementById("doDirection").innerHTML = Math.round(rotation);


      var logo = document.getElementById("imgLogo");
      logo.style.webkitTransform =
        "rotate("+ xValue +"deg) rotate3d(1,0,0, "+ (yValue*-1)+"deg)";
      logo.style.MozTransform = "rotate("+ xValue +"deg)";
      logo.style.transform =
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

      osc3.type = 'triangle';
      osc3.frequency.value = freqValue;
      osc3.connect(distortion);
      distortion.connect(audioCtx.destination);
      osc3.start();

  }, true);
} else {
  alert("Sorry, your browser doesn't support Device Orientation");
}

window.addEventListener("deviceorientation", function(event) {
  osc1.frequency.value = freqValue * (xValue*0.2);
  osc2.frequency.value = freqValue * (yValue*0.2);
  osc3.frequency.value = freqValue * (rotation*0.2);
});