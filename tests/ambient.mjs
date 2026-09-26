import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('unfold-ambient.js', root), 'utf8');
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const prior = execFileSync('git', ['show', 'HEAD:unfold-ambient.js'], {cwd:root,encoding:'utf8'});
const music = text => text.split('// Artwork sound:')[0].split('\n').slice(1).join('\n').trim();
assert.equal(music(source), music(prior), 'Existing music-status integration is unchanged');
assert.ok(!/AudioContext|createOscillator|pointerenter|pointermove|artwork/.test(source), 'All artwork sound code is removed');
assert.ok(html.includes('unfold-ambient.js?v=music-only-1'));
const flush = async () => { for (let i=0;i<20;i++) await Promise.resolve(); };
async function fixture(payload, fail = false) {
  const nodes = {
    'np-label':{textContent:'last listened to'},
    'np-track':{textContent:' · previous track'},
    'now-playing':{style:{opacity:'1'}}
  };
  const listeners = {}, delays = [], intervals = [];
  let requests = 0;
  const document = {hidden:false,getElementById:id=>nodes[id],addEventListener:(type,fn)=>{listeners[type]=fn;}};
  vm.runInNewContext(source, {
    document,
    fetch:async()=>{requests++;if(fail)throw Error('Offline');return {ok:true,json:async()=>payload};},
    setTimeout:fn=>{delays.push(fn);},
    setInterval:(fn,ms)=>{intervals.push({fn,ms});}
  });
  await flush(); delays.splice(0).forEach(fn=>fn());
  return {nodes,listeners,intervals,document,requests:()=>requests};
}
const playing=await fixture({recenttracks:{track:[{name:'Hammock Portal',artist:{'#text':'Bibio'},'@attr':{nowplaying:'true'}}]}});
assert.equal(playing.nodes['np-label'].textContent,'now playing');
assert.equal(playing.nodes['np-track'].textContent,' · Hammock Portal by Bibio');
assert.equal(playing.nodes['now-playing'].style.opacity,'1');
assert.equal(playing.intervals.length,1);
assert.equal(playing.intervals[0].ms,60000);
playing.document.hidden=true;playing.listeners.visibilitychange();await flush();
assert.equal(playing.requests(),1,'Background visibility change does not refresh');
playing.document.hidden=false;playing.listeners.visibilitychange();await flush();
assert.equal(playing.requests(),2,'Returning to the page refreshes the footer');
assert.deepEqual(Object.keys(playing.listeners),['visibilitychange'],'No hover or gesture audio listeners');
const previous=await fixture({recenttracks:{track:{name:'A song',artist:{name:'An artist'}}}});
assert.equal(previous.nodes['np-label'].textContent,'last listened to');
assert.equal(previous.nodes['np-track'].textContent,' · A song by An artist');
const empty=await fixture({recenttracks:{track:[]}});
assert.equal(empty.nodes['np-track'].textContent,' · previous track');
const offline=await fixture(null,true);
assert.equal(offline.nodes['np-track'].textContent,' · previous track');
console.log('Listening footer checks passed: status updates, visibility refresh, error fallbacks, and no sound generation.');
