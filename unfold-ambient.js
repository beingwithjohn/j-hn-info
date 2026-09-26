// The listening footer is informational only. No hover sounds or audio playback.
  (function(){
    var user='beingwithjohn',key='dcbb72775ed718d26da56bc13ca085da';
    var url='https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user='+user+'&api_key='+key+'&format=json&limit=1';
    var label=document.getElementById('np-label'),track=document.getElementById('np-track'),wrap=document.getElementById('now-playing');
    function refresh(){fetch(url,{cache:'no-store'}).then(function(response){return response.ok?response.json():null}).then(function(data){var tracks=data&&data.recenttracks&&data.recenttracks.track;var item=Array.isArray(tracks)?tracks[0]:tracks;if(!item||!item.name)return;var live=item['@attr']&&item['@attr'].nowplaying==='true';var artist=(item.artist&&(item.artist['#text']||item.artist.name))||'';var nextLabel=live?'now playing':'last listened to';var nextTrack=' · '+item.name+(artist?' by '+artist:'');if(label.textContent===nextLabel&&track.textContent===nextTrack)return;wrap.style.opacity='0';setTimeout(function(){label.textContent=nextLabel;track.textContent=nextTrack;wrap.style.opacity='1'},320)}).catch(function(){})}
    refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh()});
  })();
