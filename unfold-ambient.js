// Preserve the existing homepage music status and artwork interaction.
  (function(){
    var user='beingwithjohn',key='dcbb72775ed718d26da56bc13ca085da';
    var url='https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user='+user+'&api_key='+key+'&format=json&limit=1';
    var label=document.getElementById('np-label'),track=document.getElementById('np-track'),wrap=document.getElementById('now-playing');
    function refresh(){fetch(url,{cache:'no-store'}).then(function(response){return response.ok?response.json():null}).then(function(data){var tracks=data&&data.recenttracks&&data.recenttracks.track;var item=Array.isArray(tracks)?tracks[0]:tracks;if(!item||!item.name)return;var live=item['@attr']&&item['@attr'].nowplaying==='true';var artist=(item.artist&&(item.artist['#text']||item.artist.name))||'';var nextLabel=live?'now playing':'last listened to';var nextTrack=' · '+item.name+(artist?' by '+artist:'');if(label.textContent===nextLabel&&track.textContent===nextTrack)return;wrap.style.opacity='0';setTimeout(function(){label.textContent=nextLabel;track.textContent=nextTrack;wrap.style.opacity='1'},320)}).catch(function(){})}
    refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh()});
  })();

// A single, reusable instrument: colours balance the same pure major chord.
(function () {
  var artwork = document.getElementById('artwork');
  var button = document.getElementById('artwork-button');
  if (!artwork || !button) return;

  var base = 146.832; // D3.
  // Just-tuned major triads (4:5:6), repeated at exact octaves. No extensions,
  // detuning or moving pitches, so even rapid colour changes share one harmony.
  var ratios = [1, 5 / 4, 3 / 2, 2, 5 / 2, 3, 4, 5, 6];
  var balances = [
    [1, 0.66, 0.82, 0.40, 0.24, 0.32, 0.12, 0.08, 0.10], // yellow: warm
    [0.9, 0.76, 0.82, 0.44, 0.34, 0.32, 0.12, 0.10, 0.12], // green: full
    [0.9, 0.68, 0.90, 0.52, 0.30, 0.42, 0.16, 0.10, 0.14], // turquoise: open
    [0.9, 0.82, 0.76, 0.40, 0.44, 0.30, 0.14, 0.16, 0.10], // pink: soft
    [0.9, 0.70, 0.82, 0.54, 0.42, 0.44, 0.24, 0.18, 0.22], // silver: bright
    [1, 0.68, 0.90, 0.34, 0.24, 0.36, 0.10, 0.08, 0.12]  // blue: grounded
  ].map(function (weights) {
    // Equal energy across colours, without a compressor pumping the volume.
    var energy = Math.sqrt(weights.reduce(function (sum, weight) { return sum + weight * weight; }, 0));
    return weights.map(function (weight) { return weight / energy; });
  });

  function hold(param, time) {
    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(time);
    } else {
      var current = param.value;
      param.cancelScheduledValues(time);
      param.setValueAtTime(current, time);
    }
  }

  function approach(param, value, time, duration) {
    hold(param, time);
    param.setTargetAtTime(value, time, duration);
  }

  function settle(param, value, time) {
    hold(param, time);
    // Fully at the new level in 8ms: an anti-click edge, not an audible swell.
    param.linearRampToValueAtTime(value, time + 0.008);
  }

  function createDrone(ctx) {
    var envelope = ctx.createGain();
    envelope.gain.value = 0;
    var master = ctx.createGain();
    master.gain.value = 0.11;
    envelope.connect(master).connect(ctx.destination);

    // Pure sustained tones and fixed stereo spacing keep the upper octaves airy
    // without a reverb/noise layer building up or introducing unrelated pitches.
    var pans = [-0.12, 0.12, 0, -0.35, 0.35, -0.18, -0.6, 0.6, 0];
    var levels = [];
    var start = ctx.currentTime;
    ratios.forEach(function (ratio, index) {
      var lane = ctx.createGain();
      lane.gain.value = balances[2][index];
      var oscillator = ctx.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = base * ratio;
      oscillator.detune.value = 0;
      oscillator.connect(lane);
      if (typeof ctx.createStereoPanner === 'function') {
        var pan = ctx.createStereoPanner();
        pan.pan.value = pans[index];
        lane.connect(pan).connect(envelope);
      } else {
        lane.connect(envelope);
      }
      oscillator.start(start);
      levels.push(lane.gain);
    });

    return {
      enter: function (colour, immediate) {
        var time = ctx.currentTime;
        levels.forEach(function (gain, index) {
          if (immediate) {
            gain.setValueAtTime(balances[colour][index], time);
          } else {
            settle(gain, balances[colour][index], time);
          }
        });
        settle(master.gain, 0.11, time);
        settle(envelope.gain, 0.9, time);
      },
      leave: function (quiet) {
        approach(envelope.gain, 0, ctx.currentTime, quiet ? 0.08 : 0.65);
        if (quiet) approach(master.gain, 0, ctx.currentTime, 0.06);
      }
    };
  }

  var context = null;
  var instrument = null;
  var unlocked = false;
  var hovering = false;
  var colour = 2;
  var soundingColour = null;
  var idleTimer = null;
  var resumePending = false;

  function cancelIdle() {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  function sound() {
    if (!unlocked || !hovering || document.hidden || !context) return;
    cancelIdle();
    if (context.state !== 'running') {
      if (!resumePending && context.state === 'suspended') {
        resumePending = true;
        context.resume().then(function () {
          resumePending = false;
          if (hovering && !document.hidden) sound();
          else stop(false);
        }).catch(function () { resumePending = false; });
      }
      return;
    }
    if (soundingColour === colour) return;
    var first = !instrument;
    if (first) instrument = createDrone(context);
    instrument.enter(colour, first);
    soundingColour = colour;
  }

  function unlock(event) {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      if (!context) context = new AudioContext();
      unlocked = true;
      // Resume in the gesture itself. A hover alone cannot unlock every browser.
      if (context.state === 'suspended') {
        context.resume().then(function () {
          if (hovering && !document.hidden) sound();
          else stop(false);
        }).catch(function () {});
      } else if (hovering) {
        sound();
      } else {
        stop(false);
      }
    } catch (error) { /* Sound is an enhancement, never a navigation dependency. */ }
  }
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);

  function stop(quiet) {
    soundingColour = null;
    if (instrument) instrument.leave(quiet);
    cancelIdle();
    if (!context) return;
    // Let the release finish, then suspend instead of spending idle CPU.
    idleTimer = setTimeout(function () {
      if (!hovering && context.state === 'running') context.suspend().catch(function () {});
    }, quiet ? 600 : 6000);
  }

  function leave() {
    hovering = false;
    stop(false);
  }

  var sampler = null;
  function buildSampler() {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = Math.min(1200, artwork.naturalWidth);
      canvas.height = Math.round(canvas.width * artwork.naturalHeight / artwork.naturalWidth);
      var sampleContext = canvas.getContext('2d', { willReadFrequently: true });
      sampleContext.drawImage(artwork, 0, 0, canvas.width, canvas.height);
      sampler = sampleContext;
    } catch (error) { sampler = null; }
  }
  if (artwork.complete && artwork.naturalWidth) buildSampler();
  else artwork.addEventListener('load', buildSampler, { once: true });

  var palette = [[234, 201, 106, 0], [95, 223, 136, 1], [43, 206, 196, 2], [224, 165, 201, 3], [205, 205, 205, 4], [20, 140, 193, 5], [40, 39, 40, -1], [186, 186, 186, -1]];
  function classify(r, g, b) {
    var best = -1, distance = Infinity;
    palette.forEach(function (entry) {
      var next = (r - entry[0]) ** 2 + (g - entry[1]) ** 2 + (b - entry[2]) ** 2;
      if (next < distance) { distance = next; best = entry[3]; }
    });
    return best;
  }

  function move(event) {
    if (event.pointerType === 'touch' || event.buttons || document.hidden || !sampler) return;
    var rect = artwork.getBoundingClientRect();
    var scale = Math.min(rect.width / artwork.naturalWidth, rect.height / artwork.naturalHeight);
    if (!scale) return;
    var width = artwork.naturalWidth * scale, height = artwork.naturalHeight * scale;
    var x = (event.clientX - rect.left - (rect.width - width) / 2) / width;
    var y = (event.clientY - rect.top - (rect.height - height) / 2) / height;
    if (x < 0 || y < 0 || x >= 1 || y >= 1) { leave(); return; }
    hovering = true;
    try {
      var pixel = sampler.getImageData(Math.floor(x * sampler.canvas.width), Math.floor(y * sampler.canvas.height), 1, 1).data;
      var next = classify(pixel[0], pixel[1], pixel[2]);
      // Keep the harmony across the dark ground between stripes.
      if (next !== -1) colour = next;
      sound();
    } catch (error) { leave(); }
  }

  button.addEventListener('pointerenter', move, { passive: true });
  button.addEventListener('pointermove', move, { passive: true });
  button.addEventListener('pointerleave', leave, { passive: true });
  button.addEventListener('pointercancel', leave, { passive: true });
  window.addEventListener('blur', function () { hovering = false; stop(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hovering = false; stop(true); }
  });
  window.addEventListener('pagehide', function () {
    hovering = false;
    stop(true);
    if (context && context.state === 'running') context.suspend().catch(function () {});
  });
})();
