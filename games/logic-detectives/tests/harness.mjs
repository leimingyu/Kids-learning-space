/** Isolated DOM/storage fixture for the complete game and the real KLS bridge.
 * It never opens a browser or reads real user storage. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const gameURL = new URL('../index.html', import.meta.url);
const rootURL = new URL('../../', gameURL);
const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
export const plain = value => JSON.parse(JSON.stringify(value));

function attributes(text) {
  const result = {};
  for (const m of text.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) result[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  return result;
}
function splitSelector(text, delimiter) {
  const result=[]; let bracket=0, paren=0, quote='', current='';
  for (const ch of text) {
    if (quote) { current += ch; if (ch === quote) quote=''; continue; }
    if (ch === '"' || ch === "'") { quote=ch; current+=ch; continue; }
    if (ch === '[') bracket++; if (ch === ']') bracket--;
    if (ch === '(') paren++; if (ch === ')') paren--;
    if (!bracket && !paren && (delimiter === ',' ? ch === ',' : /\s/.test(ch))) { if(current.trim())result.push(current.trim());current=''; }
    else current += ch;
  }
  if(current.trim())result.push(current.trim()); return result;
}
function descendants(node) { return node.children.flatMap(child => [child,...descendants(child)]); }
function matches(node, selector) {
  const alternatives=splitSelector(selector, ',');
  if (alternatives.length>1) return alternatives.some(part=>matches(node,part));
  selector=selector.trim(); if(!selector)return false;
  const path=splitSelector(selector,' ');
  if (path.length>1) {
    if(!matches(node,path.at(-1)))return false;
    if(path.at(-2)==='>')return !!node.parentNode&&matches(node.parentNode,path.slice(0,-2).join(' '));
    let parent=node.parentNode;
    while(parent){if(matches(parent,path.slice(0,-1).join(' ')))return true;parent=parent.parentNode;}
    return false;
  }
  for(const m of selector.matchAll(/:not\(([^()]*)\)/g))if(matches(node,m[1]))return false;
  selector=selector.replace(/:not\([^()]*\)/g,'');
  if(selector.includes(':disabled')&&!node.disabled)return false;
  if(selector.includes(':enabled')&&node.disabled)return false;
  if(selector.includes(':checked')&&!node.checked)return false;
  selector=selector.replace(/:(disabled|enabled|checked)/g,'');
  const tag=selector.match(/^[a-z][\w-]*/i)?.[0];
  if(tag&&node.tagName!==tag.toUpperCase())return false;
  for(const m of selector.matchAll(/#([\w-]+)/g))if(node.id!==m[1])return false;
  for(const m of selector.matchAll(/\.([\w-]+)/g))if(!node.classList.contains(m[1]))return false;
  for(const m of selector.matchAll(/\[([\w-]+)(?:(\^?=)["']?([^\]"']*)["']?)?\]/g)) {
    const value=node.getAttribute(m[1]);
    if(value===null||(m[2]==='='&&value!==m[3])||(m[2]==='^='&&!value.startsWith(m[3])))return false;
  }
  return true;
}
class Node {
  constructor(tag='div') {
    this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.events={};this.parentNode=null;this.ownerDocument=null;
    this.value='';this.disabled=false;this.hidden=false;this.checked=false;this.open=false;this.text='';this.html='';
    this.style={setProperty(k,v){this[k]=String(v);},removeProperty(k){delete this[k];}};
    this.dataset=new Proxy({}, {get:(_,key)=>this.getAttribute('data-'+String(key).replace(/[A-Z]/g,m=>'-'+m.toLowerCase())),set:(_,key,value)=>{this.setAttribute('data-'+String(key).replace(/[A-Z]/g,m=>'-'+m.toLowerCase()),value);return true;}});
    this.classList={contains:key=>this.className.split(/\s+/).includes(key),add:(...keys)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...keys])].join(' ');},remove:(...keys)=>{this.className=this.className.split(/\s+/).filter(key=>!keys.includes(key)).join(' ');},toggle:(key,on)=>{on=on??!this.classList.contains(key);on?this.classList.add(key):this.classList.remove(key);return on;}};
  }
  get id(){return this.attrs.id||'';} set id(value){this.attrs.id=String(value);}
  get className(){return this.attrs.class||'';} set className(value){this.attrs.class=String(value);}
  get textContent(){return this.text+this.children.map(child=>child.textContent).join(' ');}
  set textContent(value){this.text=String(value);for(const child of this.children)child.parentNode=null;this.children=[];}
  get innerHTML(){return this.html;}
  set innerHTML(value){for(const child of this.children)child.parentNode=null;this.children=[];this.text='';this.html=String(value);parseHTML(this.html,this);}
  get firstChild(){return this.children[0]||null;} get lastChild(){return this.children.at(-1)||null;}
  get firstElementChild(){return this.firstChild;} get childElementCount(){return this.children.length;}
  get isConnected(){let node=this;while(node.parentNode)node=node.parentNode;return !!node.fixtureRoot;}
  setAttribute(key,value){this.attrs[key]=String(value);if(key==='hidden')this.hidden=true;if(key==='value')this.value=String(value);if(key==='disabled')this.disabled=true;if(key==='open')this.open=true;}
  getAttribute(key){return Object.hasOwn(this.attrs,key)?this.attrs[key]:null;}
  hasAttribute(key){return key==='hidden'?this.hidden:key==='open'?this.open:Object.hasOwn(this.attrs,key);}
  removeAttribute(key){delete this.attrs[key];if(key==='hidden')this.hidden=false;if(key==='disabled')this.disabled=false;if(key==='open')this.open=false;}
  appendChild(node){node.parentNode?.removeChild(node);node.parentNode=this;setOwner(node,this.ownerDocument);this.children.push(node);return node;}
  append(...nodes){for(const node of nodes)this.appendChild(node);}
  prepend(node){node.parentNode?.removeChild(node);node.parentNode=this;setOwner(node,this.ownerDocument);this.children.unshift(node);}
  replaceChildren(...nodes){this.textContent='';this.append(...nodes);}
  removeChild(node){this.children=this.children.filter(child=>child!==node);node.parentNode=null;return node;}
  remove(){this.parentNode?.removeChild(this);}
  querySelectorAll(selector){return descendants(this).filter(node=>matches(node,selector));}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){let node=this;while(node){if(matches(node,selector))return node;node=node.parentNode;}return null;}
  insertAdjacentHTML(position,markup){const temporary=new Node('fragment');temporary.ownerDocument=this.ownerDocument;parseHTML(markup,temporary);const nodes=[...temporary.children];if(position==='afterbegin'){for(const node of nodes.reverse())this.prepend(node);}else if(position==='beforeend')this.append(...nodes);else throw new Error('Unsupported fixture insertion '+position);}
  addEventListener(type,fn){(this.events[type]||=[]).push(fn);}
  removeEventListener(type,fn){this.events[type]=(this.events[type]||[]).filter(callback=>callback!==fn);}
  dispatchEvent(event){event.target||=this;event.currentTarget=this;event.preventDefault||=()=>{event.defaultPrevented=true;};for(const fn of [...this.events[event.type]||[]])fn(event);if(event.bubbles&&!event.cancelBubble)this.parentNode?.dispatchEvent(event);return !event.defaultPrevented;}
  click(){if(this.disabled)return;this.focus();this.dispatchEvent({type:'click',target:this,bubbles:true,preventDefault(){this.defaultPrevented=true;}});}
  focus(){if(this.ownerDocument){this.ownerDocument.activeElement=this;this.dispatchEvent({type:'focus',target:this});}}
  blur(){if(this.ownerDocument?.activeElement===this)this.ownerDocument.activeElement=this.ownerDocument.body;}
  select(){} scrollIntoView(){} scrollTo(){}
  showModal(){this.open=true;this.setAttribute('open','');(this.querySelector('[autofocus]')||this.querySelector('button'))?.focus();}
  close(value=''){if(!this.open)return;this.open=false;this.removeAttribute('open');this.returnValue=value;this.dispatchEvent({type:'close',target:this});}
  getBoundingClientRect(){return {left:0,top:0,right:100,bottom:100,width:100,height:100};}
}
function setOwner(node,document){node.ownerDocument=document;for(const child of node.children)setOwner(child,document);}
function parseHTML(html,root) {
  const stack=[root];
  for(const m of html.matchAll(/<!--[\s\S]*?-->|<\/?([a-z][\w-]*)([^>]*?)>|([^<]+)/gi)) {
    if(m[3]){stack.at(-1).text+=m[3];continue;}if(!m[1])continue;
    const tag=m[1].toLowerCase();
    if(m[0].startsWith('</')){const at=stack.findLastIndex(node=>node.tagName===tag.toUpperCase());if(at>0)stack.length=at;continue;}
    const node=new Node(tag);for(const [key,value]of Object.entries(attributes(m[2])))node.setAttribute(key,value);
    stack.at(-1).appendChild(node);if(!voidTags.has(tag)&&!m[0].endsWith('/>'))stack.push(node);
  }
}

export function harness({earlyProfile=false,standalone=false,autoBind=true,initialResume=null,initialData=[],profileId='profile-a',sessionId='logic-test'}={}) {
  const slug='logic-detectives',html=readFileSync(gameURL,'utf8'),domRoot=new Node('fixture');domRoot.fixtureRoot=true;
  parseHTML(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''),domRoot);
  const docEvents={};
  const document={body:domRoot.querySelector('body'),documentElement:domRoot.querySelector('html'),readyState:'loading',hidden:false,visibilityState:'visible',activeElement:null,
    getElementById:id=>domRoot.querySelector('#'+id),querySelector:selector=>domRoot.querySelector(selector),querySelectorAll:selector=>domRoot.querySelectorAll(selector),
    createElement:tag=>{const node=new Node(tag);setOwner(node,document);return node;},createElementNS:(_,tag)=>document.createElement(tag),
    addEventListener(type,fn){(docEvents[type]||=[]).push(fn);},removeEventListener(type,fn){docEvents[type]=(docEvents[type]||[]).filter(callback=>callback!==fn);},dispatchEvent(event){for(const fn of [...docEvents[event.type]||[]])fn(event);}};
  setOwner(domRoot,document);document.activeElement=document.body;
  const data=new Map(initialData),access=[],messages=[],errors=[],warnings=[],windowEvents={},timers=new Map(),pendingHub=[],readyStages=[],failedKeys=new Set();let timerId=0,reloadCount=0;
  const storage={getItem(key){access.push(['get',key]);return data.get(key)??null;},setItem(key,value){access.push(['set',key]);if(failedKeys.has(key))throw new Error('Test storage quota');data.set(key,String(value));},removeItem(key){access.push(['remove',key]);if(failedKeys.has(key))throw new Error('Test storage quota');data.delete(key);},key:index=>[...data.keys()][index]??null,get length(){return data.size;}};
  const parent={postMessage(message){messages.push(plain(message));if(message.event==='profileReady'){readyStages.push(document.readyState);if(initialResume)pendingHub.push(['resumeState',{state:plain(initialResume)}]);}}};
  const context=vm.createContext({document,localStorage:storage,console:{log(){},warn:(...args)=>warnings.push(args.map(String).join(' ')),error:(...args)=>errors.push(args.map(arg=>arg?.message||String(arg)).join(' '))},
    HTMLElement:Node,HTMLInputElement:Node,Node,Map,Set,Date,Math,JSON,URL,Blob,performance:{now:()=>10000},
    location:{pathname:'/games/logic-detectives/index.html',hash:'',reload(){reloadCount++;}},navigator:{},
    FileReader:class{},MutationObserver:class{observe(){}disconnect(){}},ResizeObserver:class{observe(){}disconnect(){}},
    getComputedStyle:node=>({display:node.hidden?'none':node.style.display||'block',visibility:'visible',opacity:'1'}),
    addEventListener(type,fn){(windowEvents[type]||=[]).push(fn);},removeEventListener(type,fn){windowEvents[type]=(windowEvents[type]||[]).filter(callback=>callback!==fn);},
    setTimeout(fn,delay){timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id),setInterval:()=>++timerId,clearInterval(){},requestAnimationFrame:fn=>{timers.set(++timerId,{fn,delay:0});return timerId;},cancelAnimationFrame:id=>timers.delete(id),
    scrollTo(){},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),confirm:()=>false,alert(){},parent});
  context.window=context;if(standalone)context.parent=context;
  const run=code=>vm.runInContext(code,context);
  const send=(event,payload={})=>{for(const fn of [...windowEvents.message||[]])fn({source:parent,data:{type:'kls:hub',event,slug,profileId,sessionId,...payload}});};
  const flushHub=()=>{while(pendingHub.length){const [event,payload]=pendingHub.shift();send(event,payload);}};
  let scriptIndex=0;
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src=attributes(m[1]).src;
    vm.runInContext(src?readFileSync(new URL(src,gameURL),'utf8'):m[2],context,{filename:'logic-detectives/'+(src||'inline-'+scriptIndex++)});
    if(earlyProfile&&autoBind&&src?.split('?')[0].endsWith('game-bridge.js'))send('setProfile');
    flushHub();
  }
  const accessBeforeDOMReady=plain(access);
  document.readyState='interactive';document.dispatchEvent({type:'DOMContentLoaded'});flushHub();document.readyState='complete';
  if(!standalone&&autoBind&&!earlyProfile)send('setProfile');flushHub();
  const fixture={context,run,send,document,data,access,messages,errors,warnings,timers,readyStages,failedKeys,accessBeforeDOMReady,
    node:id=>document.getElementById(id),query:selector=>document.querySelector(selector),all:selector=>document.querySelectorAll(selector),
    bind(){send('setProfile');flushHub();},
    click(selector){const node=document.querySelector(selector);assert.ok(node,'control exists: '+selector);node.click();return node;},
    input(selector,value){const node=document.querySelector(selector);assert.ok(node,'input exists: '+selector);node.value=String(value);node.dispatchEvent({type:'input',target:node,bubbles:true});return node;},
    key(selector,key){const node=document.querySelector(selector);assert.ok(node,'keyboard target exists: '+selector);node.dispatchEvent({type:'keydown',target:node,key,bubbles:true,preventDefault(){this.defaultPrevented=true;}});},
    saveReply(){const prior=messages.length;send('requestState',{requestId:'save-'+prior});const reply=messages.slice(prior).find(message=>message.event==='saveState');assert.ok(reply,'Game replies to a hub checkpoint');return reply;},
    checkpoint(){const reply=this.saveReply();assert.equal(reply.ok,true,'Checkpoint succeeds: '+reply.error);return plain(reply.state);},
    flushTimers(limit=100){let count=0;while(timers.size&&count++<limit){const [id,timer]=timers.entries().next().value;timers.delete(id);timer.fn();}},
    fire(type){for(const fn of [...windowEvents[type]||[]])fn({type});},
    get reloadCount(){return reloadCount;},
    loadBackup(){const source=readFileSync(new URL('shared/scripts/hub.js',rootURL),'utf8');const literal=source.match(/const GAMES = (\[[\s\S]*?\n  \]);/);assert.ok(literal,'Real hub registry is discoverable');context.KLS.GAMES=vm.runInNewContext('('+literal[1]+')');vm.runInContext(readFileSync(new URL('shared/scripts/backup.js',rootURL),'utf8'),context,{filename:'shared/scripts/backup.js'});return context.KLS.backup;}
  };
  return fixture;
}
