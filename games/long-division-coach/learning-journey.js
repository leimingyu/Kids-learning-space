(function (global) {
  'use strict';
  // The host owns profile selection and all storage. Mount/load/resume only read
  // snapshots; user actions report a detached snapshot through onChange.
  // Answers are replayed through the pure core instead of trusting saved rows.
  function mount(container, options) {
  options=options||{};
  if(!container||typeof container.append!=='function')throw new Error('A learning-journey container is required.');
  const document=container.ownerDocument||global.document,Core=global.DivisionPracticeCore;
  if(!Core||!global.DivisionSharingPlayer)throw new Error('Load division-core.js and sharing-player.js first.');
  let suspended=false,destroyed=false;
  const root=document.createElement('section');root.setAttribute('id','division-play-lab');root.setAttribute('aria-label','Long Division Coach');
  container.append(root);
  const view=document.createElement('div');view.setAttribute('id','dp-view');
  const saveNote=document.createElement('p');saveNote.setAttribute('id','dp-save-note');saveNote.className='dp-save-note';saveNote.setAttribute('role','status');

  const lessons=[
    {id:'equal',dividend:84,divisor:4,title:'Share without exchanging',skill:'Equal sharing without regrouping',similarDividend:96,similarDivisor:3,steps:3},
    {id:'exchange',dividend:96,divisor:4,title:'Exchange a ten',skill:'Turn one ten into ten ones',similarDividend:84,similarDivisor:3,steps:4},
    {id:'regroup',dividend:432,divisor:3,title:'Exchange hundreds and tens',skill:'Regroup into the next smaller place',similarDividend:528,similarDivisor:3,steps:6},
    {id:'zero',dividend:804,divisor:4,title:'Keep a zero in the answer',skill:'A place can have zero full shares',similarDividend:816,similarDivisor:4,steps:4},
    {id:'remainder',dividend:553,divisor:4,title:'Discover a remainder',skill:'Understand what is left over',similarDividend:565,similarDivisor:4,steps:6}
  ];
  const lessonById=id=>lessons.find(lesson=>lesson.id===id);
  const lessonKey=(id,kind)=>'lesson-'+id+'-'+kind;
  const equation=problem=>problem.dividend+' ÷ '+problem.divisor;
  const problems={
    together:{dividend:528,divisor:3,title:'Solve together'},
    solo1:{dividend:672,divisor:4,title:'Solo problem 1'},
    solo2:{dividend:738,divisor:3,title:'Solo problem 2'},
    solo3:{dividend:864,divisor:4,title:'Solo problem 3'},
    zero:{dividend:804,divisor:4,title:'Extra challenge: a zero in the answer'},
    remainder:{dividend:553,divisor:4,title:'Extra challenge: a remainder'},
    extra:{dividend:435,divisor:3,title:'Another sharing problem'}
  };
  lessons.forEach(lesson=>{
    problems[lessonKey(lesson.id,'guided')]={dividend:lesson.dividend,divisor:lesson.divisor,title:lesson.title,lessonId:lesson.id,practiceKind:'guided'};
    problems[lessonKey(lesson.id,'similar')]={dividend:lesson.similarDividend,divisor:lesson.similarDivisor,title:'Try a similar problem',lessonId:lesson.id,practiceKind:'similar'};
    problems[lessonKey(lesson.id,'retry')]={dividend:lesson.dividend,divisor:lesson.divisor,title:'Tricky problem replay',lessonId:lesson.id,practiceKind:'retry'};
  });
  const round=['solo1','solo2','solo3'],phases=['divide','multiply','subtract','bringDown'];
  const phaseLabels={divide:'Divide',multiply:'Multiply',subtract:'Subtract',bringDown:'Bring down'};
  let player=null,generation=0,advanceTimer=0,advanceEpoch=0,focusFrame=0,arrowFrame=0,pickerFrame=0,pickerScrollLeft=0,advancePending=false,feedback={text:'',kind:'neutral'};
  function freshPractice(id){return {id,replay:false,hintsUsed:0,answers:[],draft:'',verifyDraft:'',verifiedValue:null,usedHelp:false,divisionHelpUsed:false,explanationViewed:false,explanationOpen:false,wrong:0,helpDepth:0,checked:false};}
  function fresh(){return {version:1,revision:0,screen:'home',mode:'sharing',shareStep:0,shareSeen:false,selectedLesson:'equal',lessonWatch:Object.fromEntries(lessons.map(lesson=>[lesson.id,{step:0,seen:false}])),lessonWork:{},lessonContext:null,guided:freshPractice('together'),solo:freshPractice('solo1'),records:{},mistakes:{}};}
  let state=fresh();
  const copy=value=>JSON.parse(JSON.stringify(value));
  const usable=()=>!destroyed&&!suspended;
  function notify(name,payload){if(usable()&&typeof options[name]==='function'){try{return options[name](payload);}catch(error){return false;}}}
  function node(tag,attrs={},...children){
    const n=document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if(k==='class')n.className=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else if(v!==false&&v!==null&&v!==undefined)n.setAttribute(k,String(v));
    });
    children.flat().forEach(c=>{if(c!==null&&c!==undefined)n.append(typeof c==='string'?document.createTextNode(c):c);});
    return n;
  }
  const button=(label,fn,primary=false)=>node('button',{type:'button',class:'dp-button'+(primary?' dp-button-primary':''),onclick:fn},label);
  const homeButton=button('🏠 Home',goHome);homeButton.className+=' dp-home-button';
  const mainHeader=node('header',{class:'dp-header'},node('div',{},node('span',{class:'dp-eyebrow'},'Share · understand · solve'),node('h2',{},'Long Division Coach')),homeButton);
  const nav=node('nav',{class:'dp-nav','aria-label':'Learning activity'});
  [['sharing','1','Watch sharing'],['guided','2','Solve together'],['solo','3','Try solo']].forEach(([mode,number,label])=>nav.append(node('button',{type:'button','data-mode':mode,onclick:()=>{
    if(mode==='guided'&&(state.lessonContext||state.mode==='sharing'))startLessonPractice(state.lessonContext?state.lessonContext.lessonId:state.selectedLesson,'guided');
    else if(mode==='solo'&&(state.lessonContext||state.mode==='sharing'))startLessonPractice(state.lessonContext?state.lessonContext.lessonId:state.selectedLesson,'similar');
    else setMode(mode);
  }},node('span',{},number),label)));
  root.append(mainHeader,nav,view,saveNote);

  function engine(p){const problem=problems[p.id];return Core.replay(problem.dividend,problem.divisor,p.answers);}
  function active(){
    const context=state.lessonContext;
    if(context&&state.mode===(context.kind==='guided'?'guided':'solo'))return state.lessonWork[lessonKey(context.lessonId,context.kind)];
    return state.mode==='guided'?state.guided:state.solo;
  }
  function currentProblem(){return problems[active().id];}
  function goodInteger(n,min,max){return Number.isInteger(n)&&n>=min&&n<=max;}
  function cleanPractice(raw,fallback){
    if(!raw||!problems[raw.id])return freshPractice(fallback);
    const p=freshPractice(raw.id);
    try{Core.replay(problems[p.id].dividend,problems[p.id].divisor,raw.answers);p.answers=raw.answers.slice();}catch(e){return freshPractice(fallback);}
    p.draft=typeof raw.draft==='string'&&raw.draft.length<=5?raw.draft:'';
    p.verifyDraft=typeof raw.verifyDraft==='string'&&raw.verifyDraft.length<=5?raw.verifyDraft:'';
    p.replay=raw.replay===true;p.hintsUsed=goodInteger(raw.hintsUsed,0,9999)?raw.hintsUsed:raw.usedHelp?1:0;p.usedHelp=raw.usedHelp===true;p.wrong=goodInteger(raw.wrong,0,999)?raw.wrong:0;p.helpDepth=goodInteger(raw.helpDepth,0,3)?raw.helpDepth:0;
    p.divisionHelpUsed=typeof raw.divisionHelpUsed==='boolean'?raw.divisionHelpUsed:p.usedHelp?null:false;
    p.checked=Core.checkFinal(engine(p));
    p.verifiedValue=raw.verifiedValue===problems[p.id].dividend?raw.verifiedValue:null;
    p.explanationViewed=raw.explanationViewed===true;p.explanationOpen=p.checked&&raw.explanationOpen===true;
    return p;
  }
  function clean(raw){
    if(!raw||raw.version!==1)return null;
    const next=fresh();next.revision=goodInteger(raw.revision,0,Number.MAX_SAFE_INTEGER)?raw.revision:0;
    next.mode=['sharing','guided','solo'].includes(raw.mode)?raw.mode:'sharing';next.screen=['home','activity','summary'].includes(raw.screen)?raw.screen:'activity';next.shareStep=goodInteger(raw.shareStep,0,5)?raw.shareStep:0;next.shareSeen=raw.shareSeen===true;
    next.selectedLesson=lessonById(raw.selectedLesson)?raw.selectedLesson:'regroup';
    lessons.forEach(lesson=>{
      const watched=raw.lessonWatch&&raw.lessonWatch[lesson.id];
      if(watched)next.lessonWatch[lesson.id]={step:goodInteger(watched.step,0,lesson.steps-1)?watched.step:0,seen:watched.seen===true};
      else if(lesson.id==='regroup')next.lessonWatch.regroup={step:next.shareStep,seen:next.shareSeen};
      ['guided','similar','retry'].forEach(kind=>{
        const key=lessonKey(lesson.id,kind),work=raw.lessonWork&&raw.lessonWork[key];
        if(work)next.lessonWork[key]=cleanPractice({...work,id:key},key);
      });
    });
    next.shareStep=next.lessonWatch.regroup.step;next.shareSeen=next.lessonWatch.regroup.seen;
    const context=raw.lessonContext;
    if(context&&lessonById(context.lessonId)&&['guided','similar','retry'].includes(context.kind)&&next.mode===(context.kind==='guided'?'guided':'solo')){
      next.lessonContext={lessonId:context.lessonId,kind:context.kind};
      const key=lessonKey(context.lessonId,context.kind);if(!next.lessonWork[key])next.lessonWork[key]=freshPractice(key);
    }
    next.guided=cleanPractice(raw.guided,'together');if(next.guided.id!=='together')next.guided=freshPractice('together');
    next.solo=cleanPractice(raw.solo,'solo1');
    Object.keys(problems).forEach(id=>{
      const record=raw.records&&raw.records[id];if(!record)return;
      const p=cleanPractice({...record,id},id);if(p.checked)next.records[id]={...p};
    });
    Object.keys(problems).forEach(id=>{
      const m=raw.mistakes&&raw.mistakes[id];if(m&&phases.includes(m.phase))next.mistakes[id]={phase:m.phase,count:goodInteger(m.count,1,999)?m.count:1};
    });
    [next.guided,next.solo,...Object.values(next.lessonWork)].forEach(p=>{if(p.checked&&!next.records[p.id])next.records[p.id]=JSON.parse(JSON.stringify(p));});
    return next;
  }
  function persist(){
    if(!usable())return false;
    state.revision++;
    let saved=true;
    if(typeof options.onChange==='function'){try{saved=options.onChange(copy(state))!==false;}catch(error){saved=false;}}
    saveNote.textContent=saved?'Your place is remembered.':'Could not save this step. Keep this page open and try Save again.';
    saveNote.setAttribute('data-error',String(!saved));
    return saved;
  }
  function cancelAdvance(){clearTimeout(advanceTimer);advanceTimer=0;advancePending=false;advanceEpoch++;}
  function destroyView(){const picker=view.querySelector('.dp-lesson-grid');if(picker&&picker.clientWidth>0)pickerScrollLeft=picker.scrollLeft||0;generation++;cancelAnimationFrame(focusFrame);cancelAnimationFrame(arrowFrame);cancelAnimationFrame(pickerFrame);if(player){player.destroy();player=null;}view.replaceChildren();}
  function setMode(mode){if(!usable()||!['sharing','guided','solo'].includes(mode))return;cancelAdvance();feedback={text:'',kind:'neutral'};state.lessonContext=null;state.mode=mode;state.screen='activity';persist();render();focusAnswer();}
  function selectLesson(id){
    if(!usable()||!lessonById(id))return;cancelAdvance();state.selectedLesson=id;state.lessonContext=null;state.mode='sharing';state.screen='activity';feedback={text:'',kind:'neutral'};persist();render();
  }
  function startLessonPractice(id,kind,restart=false){
    if(!usable()||!lessonById(id)||!['guided','similar','retry'].includes(kind))return;
    cancelAdvance();const key=lessonKey(id,kind);if(!state.lessonWork[key]||restart){state.lessonWork[key]=freshPractice(key);state.lessonWork[key].replay=isQueued(problems[key]);}
    state.selectedLesson=id;state.lessonContext={lessonId:id,kind};state.mode=kind==='guided'?'guided':'solo';state.screen='activity';feedback={text:'',kind:'neutral'};persist();render();focusAnswer();
  }
  function header(title,subtitle,chip){return node('div',{class:'dp-topline'},node('div',{},node('h3',{},title),node('p',{class:'dp-caption'},subtitle)),chip?node('span',{class:'dp-chip'},chip):null);}
  function showFeedback(parent){const n=node('div',{class:'dp-feedback','data-kind':feedback.kind,role:feedback.kind==='error'?'alert':'status','aria-live':'polite'},feedback.text);parent.append(n);}
  function render(){
    if(!usable())return;destroyView();nav.hidden=state.screen==='home';homeButton.hidden=state.screen==='home';root.querySelectorAll('[data-mode]').forEach(b=>{const selected=b.getAttribute('data-mode')===state.mode;b.setAttribute('aria-current',selected?'step':'false');});
    if(state.screen==='home')renderHome();else if(state.screen==='summary')renderSummary();else if(state.mode==='sharing')renderSharing();else renderPractice();
  }
  function renderLessonPicker(){
    const picker=node('section',{class:'dp-lesson-picker','aria-label':'Choose a sharing example'},node('h3',{},'Choose an example to watch'),node('p',{class:'dp-caption'},'Pick any example. Each one shows a different division idea.'),node('p',{class:'dp-picker-mobile-hint'},'Swipe the cards to see all five examples.'));
    const cards=node('div',{class:'dp-lesson-grid'}),refs={};
    lessons.forEach(lesson=>{
      const watched=state.lessonWatch[lesson.id].seen,coached=!!state.records[lessonKey(lesson.id,'guided')],solved=!!state.records[lessonKey(lesson.id,'similar')];
      const choice=node('button',{type:'button',class:'dp-button','data-lesson':lesson.id,'aria-pressed':String(state.selectedLesson===lesson.id),onclick:()=>selectLesson(lesson.id)},'Watch '+equation(lesson));
      const watchStatus=node('span',{'data-done':String(watched)},watched?'✓ Watched':'○ Not watched');
      const card=node('article',{class:'dp-lesson-card','data-lesson-id':lesson.id,'data-selected':String(state.selectedLesson===lesson.id),'data-watched':String(watched),'data-solved':String(solved)},node('h4',{},lesson.title),node('p',{class:'dp-caption'},lesson.skill),choice,node('div',{class:'dp-lesson-status'},watchStatus,node('span',{'data-done':String(coached)},coached?'✓ With coach':'○ With coach'),node('span',{'data-done':String(solved)},solved?'✓ Similar solved':'○ Similar unsolved')));
      refs[lesson.id]={card,watchStatus};cards.append(card);
    });
    picker.append(cards);view.append(picker);
    // Rebuilding the activity must not jump a phone's card strip back to its
    // first example. Adjust only the strip, never the document's scroll.
    const token=generation,previousScroll=pickerScrollLeft;
    const placePicker=()=>{
      if(!usable()||token!==generation||!(cards.clientWidth>0))return;
      cards.scrollLeft=previousScroll;
      if(cards.scrollWidth>cards.clientWidth){
        const bounds=cards.getBoundingClientRect(),chosen=refs[state.selectedLesson].card.getBoundingClientRect();
        if(chosen.left<bounds.left)cards.scrollLeft+=chosen.left-bounds.left;
        else if(chosen.right>bounds.right)cards.scrollLeft+=chosen.right-bounds.right;
      }
      pickerScrollLeft=cards.scrollLeft||0;
    };
    placePicker();pickerFrame=requestAnimationFrame(placePicker);
    return refs;
  }
  function renderSharing(){
    const cards=renderLessonPicker();
    const lesson=lessonById(state.selectedLesson),watched=state.lessonWatch[lesson.id];
    const totalSteps=typeof global.DivisionSharingPlayer.createPlan==='function'?global.DivisionSharingPlayer.createPlan(lesson.dividend,lesson.divisor).stages.length:lesson.steps;
    view.append(header(equation(lesson),lesson.skill,totalSteps+' small steps'));
    const panel=node('section',{class:'dp-sharing'}),title=node('div',{class:'dp-row'}),stageTitle=node('strong'),stageCount=node('span',{class:'dp-chip'});
    title.append(stageTitle,stageCount);
    const mount=node('div',{id:'dp-sharing-mount'}),answer=node('div',{class:'dp-sharing-answer','aria-live':'polite'});
    let shareStatus=null,interacted=false;const token=generation;
    const prev=button('Previous',()=>{interacted=true;player.previous();});
    const replay=button('Replay motion',()=>{interacted=true;if(shareStatus.busy)player.finish();else player.replay();});
    const next=button('Next step',()=>{interacted=true;player.next();},true);
    const continueButton=button('Solve '+equation(lesson)+' with help →',()=>startLessonPractice(lesson.id,'guided'),true);
    const quotient=Math.floor(lesson.dividend/lesson.divisor),remainder=lesson.dividend%lesson.divisor;
    const done=node('div',{class:'dp-watch-finish',hidden:true},node('h3',{},lesson.divisor+' equal groups of '+quotient+(remainder?', with '+remainder+' left over!':'!')),node('p',{class:'dp-caption'},'Watched! Now write the steps yourself with your coach.'),node('div',{class:'dp-actions'},continueButton));
    const details=node('details',{},node('summary',{},'See the written division'));
    let demo=Core.create(lesson.dividend,lesson.divisor);while(demo.phase!=='done')demo=Core.submit(demo,Core.expectation(demo).expected).next;
    details.append(makeBoard(demo,null));done.append(details);
    panel.append(title,mount,node('div',{class:'dp-sharing-controls'},answer,node('div',{class:'dp-actions'},prev,replay,next)),done);view.append(panel);
    player=window.DivisionSharingPlayer.mount(mount,{dividend:lesson.dividend,divisor:lesson.divisor,initialStep:watched.step,onStep:s=>{
      if(!usable()||token!==generation)return;shareStatus=s;stageTitle.textContent=s.title;stageCount.textContent='Step '+(s.step+1)+' of '+(s.stageCount||totalSteps);answer.textContent='Answer: '+s.quotient+(s.complete&&s.remainder?' remainder '+s.remainder:'');
      prev.disabled=!s.canPrevious;replay.disabled=s.step===0;replay.textContent=s.busy?'Finish step':'Replay motion';next.disabled=!s.canNext;next.hidden=s.complete;done.hidden=!s.complete;
      if(!s.busy){watched.step=s.completedStep;if(s.complete&&interacted){watched.seen=true;cards[lesson.id].card.setAttribute('data-watched','true');cards[lesson.id].watchStatus.setAttribute('data-done','true');cards[lesson.id].watchStatus.textContent='✓ Watched';}if(lesson.id==='regroup'){state.shareStep=watched.step;state.shareSeen=watched.seen;}if(interacted)persist();}
    }});
  }
  function gridRow(e,content,{sign='',product=false,bracket=false,places=false}={}){
    const row=node('div',{class:'dp-paper-row'+(places?' dp-place-row':'')});
    const signNode=node('div',{class:'dp-sign','aria-hidden':sign?'false':'true'},sign);
    const grid=node('div',{class:'dp-number-grid'+(product?' dp-line-grid':'')+(bracket?' dp-bracket':''),style:'--columns:'+e.dividendDigits.length});
    content.forEach(c=>grid.append(c));row.append(signNode,grid);return row;
  }
  function digit(value,attrs={}){return node('span',{class:'dp-digit',...attrs},value===null||value===undefined?'':String(value));}
  function createAnswerInput(p,e,span=1){
    const input=node('input',{id:'dp-answer',class:'dp-input'+(span===1?' dp-input-single':''),type:'text',inputmode:'numeric',enterkeyhint:'done',autocomplete:'off',maxlength:5,'aria-label':'Your answer','aria-describedby':'dp-prompt',style:'grid-column:span '+span,value:p.draft});
    input.addEventListener('input',()=>{if(!usable())return;p.draft=input.value;persist();});
    input.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();if(!ev.repeat&&!ev.isComposing)checkAnswer();}});
    return input;
  }
  function makeBoard(e,p){
    const board=node('section',{class:'dp-board','aria-label':'Long division workspace'}),worksheet=node('div',{class:'dp-worksheet'});
    board.append(node('div',{class:'dp-board-title'},'Your long-division board'));
    const n=e.dividendDigits.length,expect=Core.expectation(e);
    const places=e.dividendDigits.map((_,col)=>{
      const full=['ones','tens','hundreds','thousands'][n-1-col]||'';
      return node('span',{class:'dp-place','aria-label':full},node('span',{class:'dp-place-long'},full),node('span',{class:'dp-place-short','aria-hidden':'true'},['O','T','H','Th'][n-1-col]||''));
    });
    worksheet.append(gridRow(e,places,{places:true}));
    const quotient=e.quotientDigits.map((d,col)=>p&&e.phase==='divide'&&col===e.activeQuotientIndex?createAnswerInput(p,e):digit(d));
    worksheet.append(gridRow(e,quotient));
    const dividend=e.dividendDigits.map((d,col)=>{
      const firstChunk=e.cycle===0&&e.phase!=='bringDown'&&e.phase!=='done'&&col<=e.activeEndIndex;
      const nextDigit=p&&e.phase==='bringDown'&&col===e.cursorIndex&&(state.mode==='guided'||p.helpDepth>0);
      return digit(d,{'data-dividend-col':col,class:'dp-digit'+(firstChunk||nextDigit?' dp-current-number':col<e.cursorIndex?' dp-used':'')});
    });
    worksheet.append(gridRow(e,dividend,{sign:String(e.divisor),bracket:true}));
    const rows=Core.displayRows(e);
    rows.forEach((r,index)=>{
      const chars=String(r.value),cells=Array.from({length:n},(_,col)=>{
        const offset=col-r.startCol,hasDigit=offset>=0&&offset<chars.length;
        const current=hasDigit&&r.type==='broughtDown'&&r.endCol===e.activeEndIndex&&e.phase!=='bringDown'&&e.phase!=='done';
        return digit(hasDigit?chars[offset]:null,{class:'dp-digit'+(current?' dp-current-number':'')});
      });
      if(p&&e.phase==='bringDown'&&index===rows.length-1)cells[e.cursorIndex]=createAnswerInput(p,e);
      worksheet.append(gridRow(e,cells,{sign:r.type==='product'?'−':'',product:r.type==='product'}));
    });
    if(p&&(e.phase==='multiply'||e.phase==='subtract')){
      const length=String(expect.expected).length,start=e.activeEndIndex-length+1,cells=[];
      for(let col=0;col<n;col++){
        if(col===start){cells.push(createAnswerInput(p,e,length));col+=length-1;}else cells.push(digit(null));
      }
      worksheet.append(gridRow(e,cells,{sign:e.phase==='multiply'?'−':''}));
    }
    board.append(worksheet);
    if(p&&e.phase!=='done')board.append(node('p',{class:'dp-board-note'},'Type in the blue cell · Enter to check'));
    if(e.phase==='done'){const a=Core.answer(e);board.append(node('p',{class:'dp-board-note'},a.text));}
    const overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');overlay.setAttribute('class','dp-board-flow');overlay.setAttribute('aria-hidden','true');board.append(overlay);
    if(p&&e.phase==='bringDown'&&(state.mode==='guided'||p.helpDepth>0)){
      const token=generation;
      arrowFrame=requestAnimationFrame(()=>{
        if(!usable()||token!==generation)return;
        const source=board.querySelector('[data-dividend-col="'+e.cursorIndex+'"]'),target=board.querySelector('#dp-answer');if(!source||!target)return;
        const b=board.getBoundingClientRect(),s=source.getBoundingClientRect(),t=target.getBoundingClientRect(),x=s.x+s.width/2-b.x,y=s.bottom-b.y,tx=t.x+t.width/2-b.x,ty=t.y-b.y;
        overlay.setAttribute('viewBox','0 0 '+b.width+' '+b.height);
        const path=document.createElementNS(overlay.namespaceURI,'path');path.setAttribute('d','M'+x+' '+y+' C'+(x+28)+' '+(y+20)+' '+(tx+28)+' '+(ty-16)+' '+tx+' '+ty+' M'+(tx-5)+' '+(ty-7)+' L'+tx+' '+ty+' L'+(tx+5)+' '+(ty-7));path.setAttribute('fill','none');path.setAttribute('stroke','var(--dp-blue)');path.setAttribute('stroke-width','2');overlay.append(path);
      });
    }
    return board;
  }
  function promptFor(e,guided){
    const x=Core.expectation(e),place=x.placeName;
    if(e.phase==='divide')return guided?'Give each of the '+e.divisor+' groups how many '+place+'?':x.prompt;
    if(e.phase==='multiply')return 'Multiply: '+e.divisor+' × '+e.qDigit+' = ?';
    if(e.phase==='subtract')return 'Subtract: '+e.currentValue+' − '+e.product+' = ?';
    if(e.phase==='bringDown')return guided?'Bring down just the next digit: '+x.expected+'.':'Bring down the next unused digit.';
    return 'Division complete.';
  }
  function hintLines(e,depth){
    const x=Core.expectation(e),q=e.qDigit;
    if(depth>=3)return ['The next value is '+x.expected+'.','Press Check answer to place it on your board.'];
    if(e.phase==='divide'){
      if(depth===1)return ['Find the largest number of groups that fits.','Your multiplication must not go over '+e.currentValue+'.'];
      return [e.divisor+' × '+x.expected+' = '+(e.divisor*x.expected),e.divisor+' × '+(x.expected+1)+' = '+(e.divisor*(x.expected+1))+' — too much.'];
    }
    if(e.phase==='multiply')return depth===1?['Multiply the number of groups by your new answer digit.','This finds how much you have shared.']:[e.divisor+' groups of '+q+' make '+x.expected+'.'];
    if(e.phase==='subtract')return depth===1?['Take away what was shared.','The amount left should be smaller than '+e.divisor+'.']:['Count up from '+e.product+' to '+e.currentValue+'.','The difference is '+x.expected+'.'];
    const next=e.dividendDigits[e.cursorIndex];
    return depth===1?['Bring down only one digit.','The board will put it beside the amount left.']:['Copy the next digit: '+next+'.',e.remainder+' in the previous place becomes '+(e.remainder*10)+' '+x.placeName+'. Then add '+next+'.'];
  }
  function recordTricky(p,e){const m=state.mistakes[p.id];state.mistakes[p.id]={phase:e.phase,count:(m?m.count:0)+1};}
  function hint(){
    if(!usable())return;const p=active(),e=engine(p);if(p.checked)return;
    p.usedHelp=true;p.divisionHelpUsed=true;p.hintsUsed++;p.helpDepth=Math.min(3,p.helpDepth+1);recordTricky(p,e);
    reportMistake(p,e,null,'hint');
    if(p.helpDepth===3)p.draft=String(Core.expectation(e).expected);
    feedback={text:'Hints help you learn. Take your time.',kind:'neutral'};persist();render();focusAnswer();
  }
  function focusAnswer(){
    const token=generation;focusFrame=requestAnimationFrame(()=>{if(usable()&&token===generation){const input=view.querySelector('#dp-answer');if(input)input.focus({preventScroll:true});}});
  }
  function toggleExplanation(){
    const p=active();if(!p.checked)return;
    cancelAdvance();p.explanationOpen=!p.explanationOpen;if(p.explanationOpen)p.explanationViewed=true;
    persist();render();
  }
  function visualProof(e){
    const a=Core.answer(e),shared=a.quotient*e.divisor;
    const counts=[Math.floor(a.quotient/100),Math.floor(a.quotient/10)%10,a.quotient%10];
    const proof=node('div',{class:'dp-proof','data-proof-total':e.dividend,'data-shared-total':shared,'data-remainder':a.remainder},node('p',{class:'dp-caption'},'Optional · see the groups together'));
    for(let group=0;group<e.divisor;group++){
      const inventory=node('div',{class:'dp-proof-inventory','aria-label':counts.map((n,u)=>n+' '+['hundred','ten','one'][u]+(n===1?'':'s')).join(', ')});
      counts.forEach((count,unit)=>{
        const pieces=node('div',{class:'dp-proof-pieces','aria-hidden':'true'});
        for(let n=0;n<count;n++)pieces.append(node('span',{class:'dp-proof-piece dp-proof-unit-'+unit}));
        if(!count)pieces.append(node('span',{},'—'));
        inventory.append(node('div',{},node('span',{class:'dp-proof-unit-label'},['Hundreds','Tens','Ones'][unit]+' '+count),pieces));
      });
      proof.append(node('div',{class:'dp-proof-group'},node('p',{class:'dp-proof-group-label'},'Group '+(group+1)+' · '+a.quotient),inventory));
    }
    proof.append(node('div',{class:'dp-proof-arrow','aria-hidden':'true'},'↓'));
    const totals=counts.map(n=>n*e.divisor);
    proof.append(node('p',{class:'dp-caption'},'Together: '+totals[0]+' hundreds, '+totals[1]+' tens, '+totals[2]+' ones.'));
    proof.append(node('p',{class:'dp-caption'},'Regroup into '+Math.floor(shared/100)+' hundreds, '+(Math.floor(shared/10)%10)+' tens and '+(shared%10)+' ones.'));
    proof.append(node('p',{class:'dp-proof-total'},'Groups together: '+shared));
    if(a.remainder)proof.append(node('p',{class:'dp-caption'},a.remainder+' left over · '+shared+' shared + '+a.remainder+' left over = '+e.dividend));
    else proof.append(node('p',{class:'dp-caption'},'All '+e.dividend+' are shared. Nothing is left over.'));
    return proof;
  }
  function renderPractice(){
    const p=active(),e=engine(p),problem=problems[p.id],guided=state.mode==='guided';
    const doneCount=round.filter(id=>state.records[id]).length;
    const context=state.lessonContext,lesson=context&&lessonById(context.lessonId);
    if(lesson)view.append(node('p',{class:'dp-lesson-path'},'Watch '+equation(lesson)+' → Solve with help → Try a similar problem'));
    view.append(header(equation(problem),guided?'Your turn. Write every step with your coach.':p.replay?'Solve this tricky problem on your own. Hints are here if you need them.':problem.title,guided?'With coach':p.replay?'Tricky replay':lesson?(context.kind==='retry'?'Tricky replay':'Similar problem'):round.includes(p.id)?'Round · '+(round.indexOf(p.id)+1)+' of 3':'Extra challenge'));
    if(lesson)view.append(node('div',{class:'dp-actions dp-practice-navigation'},button('Watch '+equation(lesson)+' again',()=>selectLesson(lesson.id)),guided?(p.checked?null:button('Try a similar problem →',()=>startLessonPractice(lesson.id,'similar'))):button('Solve '+equation(lesson)+' with help',()=>startLessonPractice(lesson.id,'guided'))));
    if(!guided&&p.id==='zero'&&p.answers.length===0)view.append(node('div',{class:'dp-feedback','data-kind':'neutral'},'A zero can belong inside the answer. Keep every place, even when no group fits.'));
    if(!guided&&p.id==='remainder'&&p.answers.length===0)view.append(node('div',{class:'dp-feedback','data-kind':'neutral'},'This problem has a leftover amount. Finish the last subtraction to find the remainder.'));
    const form=node('form',{class:'dp-practice-layout',id:'dp-answer-form',novalidate:true}),board=makeBoard(e,p.checked?null:p),coach=node('section',{class:'dp-coach','aria-label':'Division coach'});
    const cycle=node('div',{class:'dp-cycle','aria-label':'Long division steps'});
    phases.forEach(phase=>cycle.append(node('span',{class:'dp-phase','aria-current':phase===e.phase?'step':'false'},phaseLabels[phase])));
    coach.append(cycle);
    if(e.phase!=='done'){
      coach.append(node('p',{class:'dp-prompt',id:'dp-prompt'},promptFor(e,guided)));
      if(guided){
        const explanation=e.phase==='divide'?'We are sharing '+e.currentValue+' '+Core.expectation(e).placeName+'.':e.phase==='multiply'?'How much does that share altogether?':e.phase==='subtract'?'What is left to share?':'Regroup what is left into the next smaller place.';
        coach.append(node('p',{class:'dp-subprompt'},explanation));
      }
      const check=node('button',{type:'button',class:'dp-button dp-button-primary',id:'dp-check',onclick:checkAnswer},'Check answer');
      const hintButton=button(['Hint','More help','Show this step','Hint shown'][p.helpDepth],hint);hintButton.disabled=p.helpDepth===3;
      coach.append(node('div',{class:'dp-actions',style:'margin-top:16px'},check,hintButton));
      showFeedback(coach);
      if(p.helpDepth>0)coach.append(node('div',{class:'dp-hint'},hintLines(e,p.helpDepth).map(text=>node('p',{},text))));
    }else{
      coach.append(node('h3',{},'Division complete ✓'),node('p',{class:'dp-subprompt'},'You finished every division step. You can move on!'));
      coach.append(node('div',{class:'dp-actions',style:'margin-top:14px'},button(p.explanationOpen?'Hide explanation':'Why does my answer fit?',toggleExplanation)));
      if(p.explanationOpen)coach.append(visualProof(e));
    }
    form.append(board,coach);form.addEventListener('submit',event=>{event.preventDefault();checkAnswer();});view.append(form);
    if(p.checked)renderCompletion(p,e);
    else{
      const undo=button('Undo last step',()=>{cancelAdvance();if(!p.answers.length)return;p.answers.pop();p.draft='';p.verifyDraft='';p.helpDepth=0;feedback={text:'Back one step. Your earlier work is still here.',kind:'neutral'};persist();render();focusAnswer();});undo.disabled=p.answers.length===0;
      view.append(node('div',{class:'dp-under-board'},undo,node('span',{class:'dp-chip'},guided?'Coaching is on':p.usedHelp?'Hints opened for this problem':'Hints available anytime')));
    }
    if(lesson){
      view.append(node('p',{class:'dp-progress-label'},'This lesson: '+(state.lessonWatch[lesson.id].seen?'Watched':'Not watched')+' · '+(state.records[lessonKey(lesson.id,'guided')]?'Completed with coach':'Coached equation ready')+' · '+(state.records[lessonKey(lesson.id,'similar')]?'Similar problem solved':'Similar problem ready')));
    }else if(!guided){
      view.append(node('p',{class:'dp-progress-label'},'Equations completed so far: '+doneCount+' of 3'),node('div',{class:'dp-progress','aria-label':doneCount+' of 3 equations completed'},round.map(id=>node('span',{'data-complete':!!state.records[id]}))));
    }
  }
  function checkAnswer(){
    if(!usable()||state.screen!=='activity'||state.mode==='sharing')return;cancelAdvance();const p=active(),e=engine(p);if(p.checked)return;
    const raw=p.draft;
    if(!/^\d+$/.test(raw)){feedback={text:raw?'Use a whole number: digits only.':'Type an answer first.',kind:'error'};render();focusAnswer();return;}
    const value=Number(raw);
    if(e.phase==='done')return;
    const result=Core.submit(e,value);
    if(!result.correct){p.wrong++;recordTricky(p,e);reportMistake(p,e,value,'answer');let message=result.feedback.message;if(Core.expectation(e).zeroQuotient)message='No full group fits in this place. Keep this place in your answer.';feedback={text:message,kind:'error'};persist();render();focusAnswer();return;}
    p.answers=result.next.answerLog.slice();p.draft='';p.helpDepth=0;feedback={text:result.feedback.message,kind:'success'};
    if(Core.checkFinal(result.next)){
      p.checked=true;
      const previous=state.records[p.id],quality=x=>x.divisionHelpUsed===false?(x.wrong===0?4:3):x.divisionHelpUsed===true?(x.wrong===0?2:1):0;
      if(!previous||quality(p)>quality(previous))state.records[p.id]=JSON.parse(JSON.stringify(p));
      if(state.mode==='solo'&&p.wrong===0&&p.divisionHelpUsed===false){const solved=problems[p.id];Object.keys(state.mistakes).forEach(id=>{const prior=problems[id];if(prior&&prior.dividend===solved.dividend&&prior.divisor===solved.divisor)delete state.mistakes[id];});}
      persist();notify('onCompleted',{id:p.id,problem:problemFor(p),mode:state.mode,usedHelp:p.divisionHelpUsed!==false,wrong:p.wrong,replay:p.replay||!!previous,record:copy(p)});scheduleAdvance();render();return;
    }
    persist();render();focusAnswer();
  }
  function nextDestination(){
    if(state.lessonContext)return state.lessonContext.kind==='guided'?{mode:'solo',id:lessonKey(state.lessonContext.lessonId,'similar'),lessonId:state.lessonContext.lessonId,kind:'similar'}:null;
    if(state.mode==='guided')return {mode:'solo',id:round.find(id=>!state.records[id])||'solo1'};
    const index=round.indexOf(active().id);return index>=0&&index<round.length-1?{mode:'solo',id:round[index+1]}:null;
  }
  function scheduleAdvance(){
    const next=nextDestination();if(!usable()||!next||document.hidden||state.screen!=='activity')return;
    advancePending=true;const mode=state.mode,id=active().id,epoch=advanceEpoch;
    advanceTimer=setTimeout(()=>{if(!usable()||epoch!==advanceEpoch)return;advanceTimer=0;if(!advancePending||state.mode!==mode||active().id!==id||!active().checked||document.hidden){advancePending=false;return;}advancePending=false;goNext();},2000);
  }
  function goNext(){
    const destination=nextDestination();cancelAdvance();feedback={text:'',kind:'neutral'};
    if(destination&&destination.lessonId){startLessonPractice(destination.lessonId,destination.kind);}
    else if(destination){state.screen='activity';state.mode=destination.mode;if(state.solo.id!==destination.id||state.solo.checked)state.solo=freshPractice(destination.id);persist();render();focusAnswer();}
    else if(state.lessonContext){selectLesson(state.lessonContext.lessonId);}
    else{state.screen='summary';persist();render();}
  }
  function startSolo(id,replay=false){if(!usable())return;cancelAdvance();state.lessonContext=null;state.screen='activity';state.mode='solo';state.solo=freshPractice(id);state.solo.replay=replay;feedback={text:'',kind:'neutral'};persist();render();focusAnswer();}
  function repeatCurrent(){const p=active();cancelAdvance();if(state.lessonContext){state.lessonWork[p.id]=freshPractice(p.id);state.lessonWork[p.id].replay=isQueued(problems[p.id]);}else if(state.mode==='guided')state.guided=freshPractice('together');else state.solo=freshPractice(p.id);feedback={text:'',kind:'neutral'};persist();render();focusAnswer();}
  function renderCompletion(p,e){
    const a=Core.answer(e),guided=state.mode==='guided';
    const card=node('section',{class:'dp-completion','aria-live':'polite'},node('h3',{},'You solved it! 🎉'),node('p',{class:'dp-result'},a.text),node('p',{},guided?'You connected sharing to every written step.':p.divisionHelpUsed===false?'You finished every division step without opening hints!':'You completed all the division steps. Well done!'));
    card.append(node('p',{class:'dp-caption'},guided?'Completed with coaching':p.divisionHelpUsed===true?'Completed with division hints':p.divisionHelpUsed===false?'Completed without division hints':'Completed'));
    const next=button(state.lessonContext?(guided?'Try a similar problem →':'Choose another example →'):nextDestination()?'Next problem →':'See my round →',goNext,true),stay=button('Stay & read',()=>{cancelAdvance();render();});
    card.append(node('div',{class:'dp-actions'},next,stay,button('Try this one again',repeatCurrent)),node('p',{class:'dp-advance'},advancePending?'Next problem in about 2 seconds…':'Paused for review. Continue when you are ready.'));
    view.append(card);
  }
  function renderSummary(){
    const completed=round.filter(id=>state.records[id]),without=completed.filter(id=>state.records[id].divisionHelpUsed===false).length,withHints=completed.filter(id=>state.records[id].divisionHelpUsed===true).length,earlier=completed.length-without-withHints;
    const panel=node('section',{class:'dp-summary'},node('h3',{},completed.length===3?'Practice round complete! 🎉':'Your practice so far'),node('p',{class:'dp-result'},completed.length+' of 3 equations completed'),node('p',{},without+' without division hints · '+withHints+' with division hints'+(earlier?' · '+earlier+' earlier results':'')));
    panel.append(node('p',{class:'dp-caption'},'Choose another way to practise.'));
    const actions=node('div',{class:'dp-actions'},button('Practise the three again',()=>startSolo('solo1')),button('Try a zero in the answer',()=>startSolo('zero')),button('Try a remainder',()=>startSolo('remainder')),button('Another sharing problem',()=>startSolo('extra')));
    const tricky=Object.keys(state.mistakes);if(tricky.length)actions.append(button('Practise a tricky problem ('+tricky.length+')',()=>{
      replayKnown(tricky[0]);
    }));
    panel.append(actions);view.append(panel);
  }
  function problemFor(p){const problem=problems[p.id];return {dividend:problem.dividend,divisor:problem.divisor,difficulty:'easy',expectedQuotient:Math.floor(problem.dividend/problem.divisor),expectedRemainder:problem.dividend%problem.divisor};}
  function reportMistake(p,e,answer,kind){notify('onMistake',{id:p.id,problem:problemFor(p),phase:e.phase,answer,expected:Core.expectation(e).expected,hintsUsed:p.hintsUsed,wrong:p.wrong,kind});}
  function getWrongs(){
    let supplied=options.initialWrongs||[];
    if(typeof options.getWrongs==='function'){try{supplied=options.getWrongs()||[];}catch(error){supplied=[];}}
    return Array.isArray(supplied)?supplied.filter(record=>record&&record.resolved!==true):[];
  }
  function isQueued(problem){return getWrongs().some(record=>{const p=record.questionShape||record.problem||record;return p.dividend===problem.dividend&&p.divisor===problem.divisor;});}
  function replayKnown(id){
    const problem=problems[id];if(!problem)return;
    if(problem.lessonId)startLessonPractice(problem.lessonId,problem.practiceKind==='similar'?'similar':'retry',true);
    else startSolo(id,true);
  }
  function hasContinue(){return lessons.some(lesson=>state.lessonWatch[lesson.id].step>0||state.lessonWatch[lesson.id].seen)||Object.values(state.lessonWork).some(p=>p.answers.length>0||!!p.draft)||state.guided.answers.length>0||state.solo.answers.length>0||!!state.guided.draft||!!state.solo.draft||Object.keys(state.records).length>0;}
  function openClassic(mode){if(!usable())return;cancelAdvance();notify('onOpenClassic',mode);}
  function goHome(){if(!usable())return;cancelAdvance();state.screen='home';feedback={text:'',kind:'neutral'};persist();render();}
  function startTricky(){
    const saved=getWrongs(),match=saved.map(record=>{const p=record.questionShape||record.problem||record;return Object.keys(problems).find(id=>problems[id].dividend===p.dividend&&problems[id].divisor===p.divisor);}).find(Boolean);
    const id=match||(!saved.length?Object.keys(state.mistakes)[0]:null);
    if(id)replayKnown(id);else openClassic('tricky');
  }
  function renderHome(){
    const completed=round.filter(id=>state.records[id]).length,wrongs=getWrongs(),trickyCount=wrongs.length||Object.keys(state.mistakes).length;
    const watched=lessons.filter(lesson=>state.lessonWatch[lesson.id].seen).length,coached=lessons.filter(lesson=>state.records[lessonKey(lesson.id,'guided')]).length,similar=lessons.filter(lesson=>state.records[lessonKey(lesson.id,'similar')]).length;
    view.append(node('div',{class:'dp-home-intro'},node('h3',{},'Make long division make sense.'),node('p',{class:'dp-caption'},'Watch equal sharing, solve with your coach, then write the steps on your own.')));
    if(hasContinue())view.append(node('div',{class:'dp-actions',style:'margin-bottom:18px'},button('Continue where I left off →',()=>{state.screen='activity';persist();render();focusAnswer();},true)));
    const cards=node('div',{class:'dp-home-grid'});
    [['sharing','1 · See it','Watch sharing','Choose from five examples. Follow arrows, exchanges, zero shares and remainders.','Choose an example'],['guided','2 · Write it','Solve together','Use a real division board for 528 ÷ 3. Your coach explains each step.','Solve with my coach'],['solo','3 · Try it','Try solo','Complete three equations. Hints are always available when you need them.','Try a solo problem']].forEach(([mode,step,title,description,label])=>cards.append(node('section',{class:'dp-home-card'},node('span',{class:'dp-home-step'},step),node('h3',{},title),node('p',{},description),button(label,()=>setMode(mode),true))));
    view.append(cards,node('p',{class:'dp-home-status'},'Five sharing lessons: '+watched+' watched · '+coached+' completed with coach · '+similar+' similar problems solved.'),node('p',{class:'dp-caption'},'More practice: '+(state.guided.checked?'528 ÷ 3 complete with coach':'528 ÷ 3 ready with coach')+' · '+completed+' of 3 solo equations complete.'),node('div',{class:'dp-progress','aria-label':completed+' of 3 solo equations complete'},round.map(id=>node('span',{'data-complete':!!state.records[id]}))));
    const actions=node('div',{class:'dp-home-footer'},button('Daily mission',()=>openClassic('game')),button('More practice · Easy / Medium / Hard',()=>openClassic('practice')));
    if(trickyCount)actions.append(button('Tricky practice ('+trickyCount+')',startTricky));
    actions.append(button('Reset my progress',()=>{if(!usable())return;if(typeof options.onReset==='function'){if(notify('onReset')===false){saveNote.textContent='Could not reset your progress. Keep this page open and try again.';saveNote.setAttribute('data-error','true');}}else{reset();persist();}}));view.append(actions);
  }
  function visibilityChanged(){
    if(document.hidden){cancelAdvance();destroyView();}
    else if(usable())render();
  }
  function suspend(){if(destroyed||suspended)return;suspended=true;cancelAdvance();destroyView();}
  function resume(){if(destroyed)return;suspended=false;cancelAdvance();render();}
  function load(snapshot){if(destroyed)return;cancelAdvance();destroyView();state=clean(snapshot)||fresh();feedback={text:'',kind:'neutral'};saveNote.textContent='';if(!suspended)render();}
  function reset(){if(destroyed)return;load(null);}
  function destroy(){if(destroyed)return;suspended=true;destroyed=true;cancelAdvance();destroyView();document.removeEventListener('visibilitychange',visibilityChanged);root.remove();}
  document.addEventListener('visibilitychange',visibilityChanged);
  state=clean(options.initialState)||fresh();render();
  return Object.freeze({getState:()=>copy(state),load,suspend,resume,goHome,reset,destroy});
  }
  global.LDCLearningJourney=Object.freeze({mount});
})(window);
