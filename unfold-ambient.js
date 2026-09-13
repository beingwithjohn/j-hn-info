// Preserve the existing homepage music status and artwork interaction.
  (function(){
    var user='beingwithjohn',key='dcbb72775ed718d26da56bc13ca085da';
    var url='https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user='+user+'&api_key='+key+'&format=json&limit=1';
    var label=document.getElementById('np-label'),track=document.getElementById('np-track'),wrap=document.getElementById('now-playing');
    function refresh(){fetch(url,{cache:'no-store'}).then(function(response){return response.ok?response.json():null}).then(function(data){var tracks=data&&data.recenttracks&&data.recenttracks.track;var item=Array.isArray(tracks)?tracks[0]:tracks;if(!item||!item.name)return;var live=item['@attr']&&item['@attr'].nowplaying==='true';var artist=(item.artist&&(item.artist['#text']||item.artist.name))||'';var nextLabel=live?'now playing':'last listened to';var nextTrack=' · '+item.name+(artist?' by '+artist:'');if(label.textContent===nextLabel&&track.textContent===nextTrack)return;wrap.style.opacity='0';setTimeout(function(){label.textContent=nextLabel;track.textContent=nextTrack;wrap.style.opacity='1'},320)}).catch(function(){})}
    refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh()});
  })();

  (function(){
    var artwork=document.getElementById('artwork'),button=document.getElementById('artwork-button');
    var context=null;
    function ensureContext(){if(!context){var AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return null;context=new AudioContext()}if(context.state==='suspended')context.resume().catch(function(){});return context}
    document.addEventListener('pointerdown',ensureContext,{once:true});
    var semitones=[0,2,4,7,9,12,14,16,19,21],base=261.63,volume=.10;
    function play(note){var ctx=ensureContext();if(!ctx||ctx.state!=='running')return;var oscillator=ctx.createOscillator(),gain=ctx.createGain(),time=ctx.currentTime;oscillator.type='sine';oscillator.frequency.value=base*Math.pow(2,semitones[note%semitones.length]/12);gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+.02);gain.gain.exponentialRampToValueAtTime(.0001,time+.9);oscillator.connect(gain).connect(ctx.destination);oscillator.start(time);oscillator.stop(time+1)}
    var sampler=null;
    function buildSampler(){try{var canvas=document.createElement('canvas');canvas.width=artwork.naturalWidth;canvas.height=artwork.naturalHeight;var sampleContext=canvas.getContext('2d',{willReadFrequently:true});sampleContext.drawImage(artwork,0,0);sampler=sampleContext}catch(error){sampler=null}}
    if(artwork.complete&&artwork.naturalWidth)buildSampler();else artwork.addEventListener('load',buildSampler,{once:true});
    var palette=[[234,201,106,0],[95,223,136,1],[43,206,196,2],[224,165,201,3],[205,205,205,4],[20,140,193,5],[40,39,40,-1],[186,186,186,-1]];
    function classify(r,g,b){var best=-1,distance=Infinity;palette.forEach(function(colour){var next=(r-colour[0])*(r-colour[0])+(g-colour[1])*(g-colour[1])+(b-colour[2])*(b-colour[2]);if(next<distance){distance=next;best=colour[3]}});return best}
    var lastNote=null;
    button.addEventListener('pointermove',function(event){if(!sampler)return;var rect=artwork.getBoundingClientRect(),naturalWidth=artwork.naturalWidth,naturalHeight=artwork.naturalHeight,scale=Math.min(rect.width/naturalWidth,rect.height/naturalHeight),drawWidth=naturalWidth*scale,drawHeight=naturalHeight*scale,offsetX=rect.left+(rect.width-drawWidth)/2,offsetY=rect.top+(rect.height-drawHeight)/2,x=Math.floor((event.clientX-offsetX)/scale),y=Math.floor((event.clientY-offsetY)/scale);if(x<0||y<0||x>=naturalWidth||y>=naturalHeight){lastNote=null;return}try{var pixel=sampler.getImageData(x,y,1,1).data,note=classify(pixel[0],pixel[1],pixel[2]);if(note===-1){lastNote=null;return}if(note!==lastNote){lastNote=note;play(note)}}catch(error){}} ,{passive:true});
    button.addEventListener('pointerleave',function(){lastNote=null},{passive:true});
  })();
