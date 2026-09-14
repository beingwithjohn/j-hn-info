// Preserve the existing homepage music status and artwork interaction.
  (function(){
    var user='beingwithjohn',key='dcbb72775ed718d26da56bc13ca085da';
    var url='https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user='+user+'&api_key='+key+'&format=json&limit=1';
    var label=document.getElementById('np-label'),track=document.getElementById('np-track'),wrap=document.getElementById('now-playing');
    function refresh(){fetch(url,{cache:'no-store'}).then(function(response){return response.ok?response.json():null}).then(function(data){var tracks=data&&data.recenttracks&&data.recenttracks.track;var item=Array.isArray(tracks)?tracks[0]:tracks;if(!item||!item.name)return;var live=item['@attr']&&item['@attr'].nowplaying==='true';var artist=(item.artist&&(item.artist['#text']||item.artist.name))||'';var nextLabel=live?'now playing':'last listened to';var nextTrack=' · '+item.name+(artist?' by '+artist:'');if(label.textContent===nextLabel&&track.textContent===nextTrack)return;wrap.style.opacity='0';setTimeout(function(){label.textContent=nextLabel;track.textContent=nextTrack;wrap.style.opacity='1'},320)}).catch(function(){})}
    refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh()});
  })();

// Artwork sound: brief, movement-triggered major-chord sparkles.
(function () {
  var artwork = document.getElementById('artwork');
  var button = document.getElementById('artwork-button');
  if (!artwork || !button) return;

  var base = 587.328; // D5: small, bright notes, with no sustained bass/chord.
  // Root, pure major third and fifth at two octaves. Every overlap shares D major.
  var ratios = [1, 5 / 4, 3 / 2, 2, 5 / 2, 3];

  function hold(param, time) {
    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(time);
    } else {
      var current = param.value;
      param.cancelScheduledValues(time);
      param.setValueAtTime(current, time);
    }
  }

  function createSparkle(ctx) {
    var master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    var active = new Set();
    var lastStrike = -Infinity;

    return {
      strike: function (colour, position) {
        var time = ctx.currentTime;
        // No queue: ignore excess crossings, never play them after motion stops.
        if (time - lastStrike < 0.06 || active.size >= 12) return false;
        lastStrike = time;
        var note = {nodes: [], oscillators: [], gains: [], remaining: 2};
        active.add(note);
        var output = master;
        if (typeof ctx.createStereoPanner === 'function') {
          output = ctx.createStereoPanner();
          output.pan.value = Math.max(-0.6, Math.min(0.6, (position - 0.5) * 1.2));
          output.connect(master);
          note.nodes.push(output);
        }
        // A bright octave transient above a plucked sine tone. No detuning,
        // pitch bending, noise or reverb to introduce tension or a swelling bed.
        [[1, 0.07, 0.52, 0.62], [2, 0.022, 0.17, 0.24]].forEach(function (partial) {
          var oscillator = ctx.createOscillator();
          oscillator.type = 'sine';
          oscillator.frequency.value = base * ratios[colour] * partial[0];
          oscillator.detune.value = 0;
          var level = ctx.createGain();
          var peak = partial[1] / (1 + colour * 0.06);
          level.gain.value = 0;
          level.gain.setValueAtTime(0, time);
          level.gain.linearRampToValueAtTime(peak, time + 0.003);
          level.gain.exponentialRampToValueAtTime(0.00001, time + partial[2]);
          level.gain.linearRampToValueAtTime(0, time + partial[3]);
          oscillator.connect(level).connect(output);
          note.nodes.push(oscillator, level);
          note.oscillators.push(oscillator);
          note.gains.push(level.gain);
          oscillator.onended = function () {
            note.remaining--;
            if (note.remaining) return;
            note.nodes.forEach(function (node) { node.disconnect(); });
            active.delete(note);
          };
          oscillator.start(time);
          oscillator.stop(time + partial[3] + 0.02);
        });
        return true;
      },
      quiet: function () {
        active.forEach(function (note) {
          note.gains.forEach(function (gain) {
            hold(gain, ctx.currentTime);
            gain.linearRampToValueAtTime(0, ctx.currentTime + 0.012);
          });
          note.oscillators.forEach(function (oscillator) {
            oscillator.stop(ctx.currentTime + 0.02);
          });
        });
        lastStrike = -Infinity;
      }
    };
  }

  var context = null;
  var instrument = null;
  var unlocked = false;
  var hovering = false;
  var colour = -1;
  var position = 0.5;
  var soundingColour = null;
  var idleTimer = null;
  var resumePending = false;

  function cancelIdle() {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  function sleepWhenQuiet() {
    cancelIdle();
    if (!context) return;
    // A resting cursor is silent too; no permanent oscillator graph or idle CPU.
    idleTimer = setTimeout(function () {
      if (context.state === 'running') context.suspend().catch(function () {});
    }, 900);
  }

  function sound() {
    if (!unlocked || !hovering || colour < 0 || document.hidden || !context) return;
    if (soundingColour === colour) return;
    cancelIdle();
    if (context.state !== 'running') {
      if (!resumePending && context.state === 'suspended') {
        resumePending = true;
        context.resume().then(function () {
          resumePending = false;
          sleepWhenQuiet();
          if (hovering && !document.hidden && colour >= 0) sound();
        }).catch(function () { resumePending = false; });
      }
      return;
    }
    if (!instrument) instrument = createSparkle(context);
    instrument.strike(colour, position);
    // A rate-limited crossing is consumed too: no repeated notes under a still cursor.
    soundingColour = colour;
    sleepWhenQuiet();
  }

  function unlock(event) {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    if (event.pointerType === 'touch') return;
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      if (!context) context = new AudioContext();
      unlocked = true;
      // Resume in the gesture itself. Hover alone cannot unlock every browser.
      if (context.state === 'suspended') {
        context.resume().then(function () {
          sleepWhenQuiet();
          if (hovering && !document.hidden && colour >= 0) sound();
        }).catch(function () {});
      } else {
        sleepWhenQuiet();
        if (hovering && !document.hidden && colour >= 0) sound();
      }
    } catch (error) { /* Sound is an enhancement, never a navigation dependency. */ }
  }
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);

  function stop(quiet) {
    soundingColour = null;
    if (quiet && instrument) instrument.quiet();
    sleepWhenQuiet();
  }

  function leave() {
    hovering = false;
    colour = -1;
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
      position = x;
      colour = next;
      // Frame and dark ground are silent. A later stripe can sparkle afresh.
      if (next === -1) { soundingColour = null; return; }
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
