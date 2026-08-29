(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // 모든 수치는 실제 실측값이 아니라 교수학습용 게임 상대값이다.
  const FACILITIES = {
    residential: { name:"주거지", icon:"🏢", cost:2, dev:5, demand:2, supply:0, carbon:0, water:1, phase:1, maxLevel:3, desc:"🌳 인접 시 생활권 +4" },
    factory:     { name:"공장", icon:"🏭", cost:4, dev:2, demand:4, supply:0, carbon:2, water:1, phase:1, maxLevel:3, desc:"⚡ 발전소 인접 시 생산 +7" },
    data:        { name:"데이터센터", icon:"🖥️", cost:6, dev:10, demand:8, supply:0, carbon:0, water:5, phase:1, maxLevel:3, desc:"💧 냉각시설 인접 시 AI산업 +10" },
    thermal:     { name:"화력발전", icon:"🔥", cost:5, dev:3, demand:0, supply:13, carbon:8, water:2, phase:1, maxLevel:3, desc:"전력↑ · 탄소 부담 큼" },
    nuclear:     { name:"핵발전", icon:"⚛️", cost:8, dev:3, demand:0, supply:19, carbon:1, water:5, phase:1, maxLevel:3, desc:"💧 냉각시설 인접 시 물부담↓" },
    solar:       { name:"태양광", icon:"☀️", cost:5, dev:3, demand:0, supply:7, carbon:0, water:0, phase:3, maxLevel:3, desc:"🔋 저장장치 인접 시 안정공급" },
    wind:        { name:"풍력", icon:"🌬️", cost:5, dev:3, demand:0, supply:8, carbon:0, water:0, phase:3, maxLevel:3, desc:"🔋 저장장치 인접 시 안정공급" },
    battery:     { name:"에너지저장", icon:"🔋", cost:4, dev:2, demand:1, supply:0, carbon:0, water:0, phase:3, maxLevel:3, desc:"☀️🌬️ 인접 재생에너지 안정화" },
    cooling:     { name:"순환냉각", icon:"💧", cost:4, dev:1, demand:1, supply:0, carbon:0, water:-5, phase:3, maxLevel:3, desc:"🖥️/⚛️ 인접 시 추가 효과" },
    green:       { name:"녹지", icon:"🌳", cost:2, dev:1, demand:0, supply:0, carbon:-1, water:0, phase:3, maxLevel:1, desc:"🏢 주거 인접 시 생활권 +4" }
  };

  const BADGES = [
    {id:"builder", icon:"🏗️", name:"첫 도시"},
    {id:"crisis", icon:"🚨", name:"위기 발견"},
    {id:"scholar", icon:"🧠", name:"개념 해금"},
    {id:"expansion", icon:"🗺️", name:"영토 확장"},
    {id:"synergy", icon:"🔗", name:"인접 설계"},
    {id:"upgrade", icon:"⬆️", name:"Lv.2 달성"},
    {id:"evidence", icon:"📚", name:"근거 3개"},
    {id:"mayor", icon:"🏅", name:"주체적 시장"}
  ];

  const state = {
    phase:1,
    credits:36,
    turn:0,
    selectedFacility:"residential",
    selectedCell:null,
    gridSize:5,
    grid:Array(25).fill(null), // {type, level}
    metrics:null,
    baseline:null,
    firstCitySnapshot:null,
    quizIndex:0,
    quizCorrect:0,
    quizAnswered:false,
    evidence:[],
    badges:new Set(),
    sound:true,
    chart:null,
    advisorQuestions:0,
    expandedCells:new Set()
  };

  const els = {
    loading:$("#loadingScreen"), loadingText:$("#loadingText"), loadingBar:$("#loadingBar"),
    cityGrid:$("#cityGrid"), facilityDock:$("#facilityDock"), boardSizeChip:$("#boardSizeChip"),
    credits:$("#credits"), devScore:$("#devScore"), energyScore:$("#energyScore"), carbonScore:$("#carbonScore"), waterScore:$("#waterScore"),
    energyCard:$("#energyCard"), carbonCard:$("#carbonCard"), waterCard:$("#waterCard"), turnCount:$("#turnCount"),
    missionTitle:$("#missionTitle"), phaseText:$("#phaseText"), teacherNote:$("#teacherNote"), advanceBtn:$("#advanceBtn"),
    aiAdviceBtn:$("#aiAdviceBtn"), advisorLog:$("#advisorLog"), promptChips:$("#promptChips"), badges:$("#badges"), badgeCount:$("#badgeCount"),
    chartFallback:$("#chartFallback"), evidenceBox:$("#evidenceBox"), evidenceConcept:$("#evidenceConcept"), evidenceReason:$("#evidenceReason"),
    evidenceCount:$("#evidenceCount"), evidenceList:$("#evidenceList"), saveEvidenceBtn:$("#saveEvidenceBtn"), boardOverlay:$("#boardOverlay"),
    modal:$("#modal"), modalCard:$("#modalCard"), toastStack:$("#toastStack"), rightPanel:$("#rightPanel")
  };

  function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
  function roman(n){return ["","Ⅰ","Ⅱ","Ⅲ"][n] || n;}
  function stageLevelCap(){return state.phase >= 3 ? 3 : 2;}
  function upgradeCost(cell){const f=FACILITIES[cell.type]; return Math.ceil(f.cost * (cell.level===1 ? 1.0 : 1.45));}
  function investedCost(cell){let sum=FACILITIES[cell.type].cost; for(let l=1;l<cell.level;l++) sum += Math.ceil(FACILITIES[cell.type].cost*(l===1?1.0:1.45)); return sum;}

  function cellStats(cell){
    const f=FACILITIES[cell.type], L=cell.level;
    const outMul=[0,1,1.48,1.92][L];
    const demandMul=[0,1,1.24,1.45][L];
    const impactMul=[0,1,1.16,1.30][L];
    const negMul=[0,1,1.35,1.65][L];
    return {
      dev:(f.dev||0)*outMul,
      demand:(f.demand||0)*demandMul,
      supply:(f.supply||0)*outMul,
      carbon:(f.carbon||0) < 0 ? (f.carbon||0)*negMul : (f.carbon||0)*impactMul,
      water:(f.water||0) < 0 ? (f.water||0)*negMul : (f.water||0)*impactMul
    };
  }

  function neighborIndices(index, size=state.gridSize){
    const r=Math.floor(index/size), c=index%size, arr=[];
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{const nr=r+dr,nc=c+dc;if(nr>=0&&nr<size&&nc>=0&&nc<size)arr.push(nr*size+nc);});
    return arr;
  }
  function hasNeighbor(index, types){return neighborIndices(index).some(i=>state.grid[i] && types.includes(state.grid[i].type));}

  function getCellSpatial(index){
    const cell=state.grid[index]; if(!cell) return {positive:[], warnings:[]};
    const positive=[], warnings=[]; const t=cell.type;
    if(t==="factory") (hasNeighbor(index,["thermal","nuclear","solar","wind"]) ? positive : warnings).push("발전소 인접");
    if(t==="data") (hasNeighbor(index,["cooling"]) ? positive : warnings).push("순환냉각 인접");
    if(t==="residential" && hasNeighbor(index,["green"])) positive.push("녹지 생활권");
    if(["solar","wind"].includes(t)) (hasNeighbor(index,["battery"]) ? positive : warnings).push("저장장치 연결");
    if(t==="battery" && hasNeighbor(index,["solar","wind"])) positive.push("재생에너지 연결");
    if(t==="nuclear" && hasNeighbor(index,["cooling"])) positive.push("냉각 보조");
    if(t==="cooling" && hasNeighbor(index,["data","nuclear"])) positive.push("냉각 수요 연결");
    if(["factory","thermal"].includes(t) && hasNeighbor(index,["residential"])) warnings.push("주거지 오염 갈등");
    return {positive,warnings};
  }

  function calcMetrics(grid=state.grid){
    let dev=0,demand=0,supply=0,carbon=0,water=0,renewableSupply=0,dataCount=0,thermalCount=0;
    let synergyScore=0, synergyLinks=0, conflictPairs=0, heatCluster=0;
    const linkedRenewables=new Set();

    grid.forEach((cell,i)=>{
      if(!cell) return;
      const s=cellStats(cell); dev+=s.dev; demand+=s.demand; supply+=s.supply; carbon+=s.carbon; water+=s.water;
      if(["solar","wind"].includes(cell.type)) renewableSupply+=s.supply;
      if(cell.type==="data")dataCount++; if(cell.type==="thermal")thermalCount++;

      const ns=neighborIndices(i);
      if(cell.type==="factory"){
        if(ns.some(n=>grid[n] && ["thermal","nuclear","solar","wind"].includes(grid[n].type))){const b=12*cell.level;dev+=b;synergyScore+=b;synergyLinks++;}
      }
      if(cell.type==="data"){
        if(ns.some(n=>grid[n]?.type==="cooling")){const b=10*cell.level;dev+=b;water-=4*cell.level;synergyScore+=b;synergyLinks++;}
        ns.forEach(n=>{if(grid[n]?.type==="data" && n>i)heatCluster++;});
      }
      if(cell.type==="residential" && ns.some(n=>grid[n]?.type==="green")){dev+=4*cell.level;synergyScore+=4*cell.level;synergyLinks++;}
      if(["solar","wind"].includes(cell.type) && ns.some(n=>grid[n]?.type==="battery")){linkedRenewables.add(i); synergyLinks++; synergyScore+=3*cell.level;}
      if(cell.type==="nuclear" && ns.some(n=>grid[n]?.type==="cooling")){water-=2*cell.level;synergyLinks++; synergyScore+=2;}
      if(["factory","thermal"].includes(cell.type)) ns.forEach(n=>{if(grid[n]?.type==="residential"){conflictPairs++;dev-=3;carbon+=1;}});
    });

    water += heatCluster*2;
    // 재생에너지는 저장장치와 직접 인접한 경우 변동성 패널티가 크게 감소한다.
    let renewablePenalty=0;
    grid.forEach((cell,i)=>{
      if(!cell || !["solar","wind"].includes(cell.type)) return;
      const s=cellStats(cell); renewablePenalty += s.supply * (linkedRenewables.has(i) ? 0.05 : 0.25);
    });
    const reliableSupply=Math.max(0,supply-renewablePenalty);
    const balance=reliableSupply-demand, overload=Math.max(0,demand-reliableSupply);
    const sustainability=clamp(100-carbon*3.6-Math.max(0,water-10)*2.5-overload*6-conflictPairs*4,0,100);
    const reliability=clamp(68+balance*3+linkedRenewables.size*6-heatCluster*5,0,100);
    return {
      dev:Math.round(dev), demand:round1(demand), supply:round1(supply), reliableSupply:round1(reliableSupply), balance:round1(balance),
      carbon:Math.max(0,round1(carbon)), water:Math.max(0,round1(water)), heatCluster, renewableSupply:round1(renewableSupply),
      dataCount, thermalCount, synergyScore:Math.round(synergyScore), synergyLinks, conflictPairs,
      sustainability:Math.round(sustainability), reliability:Math.round(reliability)
    };
  }
  function round1(v){return Math.round(v*10)/10;}

  function showToast(title,text=""){
    const div=document.createElement("div");div.className="toast";div.innerHTML=`<strong>${title}</strong>${text?`<div>${text}</div>`:""}`;els.toastStack.appendChild(div);
    if(window.anime)anime({targets:div,translateX:[30,0],opacity:[0,1],duration:300,easing:"easeOutCubic"});
    setTimeout(()=>{if(window.anime)anime({targets:div,translateX:[0,40],opacity:[1,0],duration:240,complete:()=>div.remove()});else div.remove();},2800);
  }
  function beep(freq=540,duration=.055){if(!state.sound)return;try{const C=window.AudioContext||window.webkitAudioContext,c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=freq;g.gain.value=.03;o.connect(g);g.connect(c.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+duration);o.stop(c.currentTime+duration);}catch(_){}}
  function updateIcons(){if(window.lucide)lucide.createIcons();}
  function setModal(html){els.modalCard.innerHTML=html;els.modal.classList.remove("hidden");updateIcons();if(window.anime)anime({targets:els.modalCard,scale:[.96,1],opacity:[0,1],duration:220,easing:"easeOutCubic"});}
  function closeModal(){els.modal.classList.add("hidden");els.modalCard.innerHTML="";}
  function unlockBadge(id){if(state.badges.has(id))return;state.badges.add(id);renderBadges();const b=BADGES.find(x=>x.id===id);showToast("성취 해금",`${b.icon} ${b.name}`);beep(760,.08);}

  function renderGrid(){
    els.cityGrid.innerHTML="";
    els.cityGrid.style.setProperty("--grid-size",state.gridSize);
    els.cityGrid.setAttribute("aria-label",`${state.gridSize}x${state.gridSize} 도시 보드`);
    els.boardSizeChip.textContent=`${state.gridSize}×${state.gridSize}`;
    state.grid.forEach((cell,i)=>{
      const btn=document.createElement("button");btn.className="city-cell";btn.dataset.index=i;
      if(cell)btn.dataset.type=cell.type;if(state.selectedCell===i)btn.classList.add("selected");if(state.expandedCells.has(i))btn.classList.add("new-land");
      let html=`<span class="cell-index">${String(i+1).padStart(2,"0")}</span>`;
      if(cell){
        const f=FACILITIES[cell.type],sp=getCellSpatial(i);const marker=sp.positive.length?`<span class="link-mark good">🔗</span>`:(sp.warnings.length?`<span class="link-mark warn">!</span>`:"");
        html+=`<span class="facility-glow"></span><span class="facility-icon">${f.icon}</span><span class="level-badge">${roman(cell.level)}</span>${marker}<span class="facility-name">${f.name}</span>`;
        btn.title=`${f.name} Lv.${cell.level}${sp.positive.length?` · ${sp.positive.join(", ")}`:""}${sp.warnings.length?` · ⚠ ${sp.warnings.join(", ")}`:""}`;
      }
      btn.innerHTML=html;btn.addEventListener("click",()=>handleCellClick(i));els.cityGrid.appendChild(btn);
    });
  }

  function renderDock(){
    els.facilityDock.innerHTML="";
    Object.entries(FACILITIES).forEach(([key,f])=>{
      if(f.phase===3 && state.phase<3)return;
      const locked=state.phase===2||state.phase===4||state.phase<f.phase;
      const btn=document.createElement("button");btn.className="facility-btn"+(state.selectedFacility===key?" active":"")+(locked?" locked":"");btn.disabled=locked;btn.title=`${f.name} — ${f.desc}`;
      btn.innerHTML=`<div class="f-top"><span class="f-icon">${f.icon}</span><span class="cost">-${f.cost}C</span></div><strong>${f.name}</strong><small>${f.desc}</small>`;
      btn.addEventListener("click",()=>{state.selectedFacility=key;renderDock();beep();});els.facilityDock.appendChild(btn);
    });
  }

  function renderBadges(){els.badges.innerHTML=BADGES.map(b=>`<div class="badge ${state.badges.has(b.id)?"unlocked":""}"><span>${b.icon}</span><strong>${b.name}</strong></div>`).join("");els.badgeCount.textContent=`${state.badges.size} / ${BADGES.length}`;}
  function renderEvidence(){
    const good=state.evidence.filter(e=>e.good).length;els.evidenceCount.textContent=`${Math.min(good,3)} / 3`;
    els.evidenceList.innerHTML=state.evidence.slice(-4).reverse().map(e=>`<div class="evidence-item"><b>${e.good?"근거 인정":"보완 필요"}</b> · ${e.conceptLabel}<br>${escapeHtml(e.reason)}</div>`).join("");
    if(good>=3)unlockBadge("evidence");
  }

  function updateUI(){
    const m=calcMetrics();state.metrics=m;els.credits.textContent=state.credits;els.devScore.textContent=m.dev;els.turnCount.textContent=state.turn;
    if(state.phase>=2){[els.energyCard,els.carbonCard,els.waterCard].forEach(e=>e.classList.remove("locked"));els.energyScore.textContent=`${m.reliableSupply} / ${m.demand}`;els.carbonScore.textContent=m.carbon;els.waterScore.textContent=m.water;}
    else{[els.energyCard,els.carbonCard,els.waterCard].forEach(e=>e.classList.add("locked"));els.energyScore.textContent=els.carbonScore.textContent=els.waterScore.textContent="???";}

    els.rightPanel.classList.toggle("has-evidence",state.phase===3);
    if(state.phase===1){els.phaseText.textContent="1단계 · 무지성 실행";els.missionTitle.textContent="AI 조언으로 5×5 도시를 성장시켜라";els.teacherNote.innerHTML=`<i data-lucide="link"></i><p><strong>공간 규칙:</strong> 건물 터치=관리 · 🔗 인접 보너스 · Lv.2까지 강화 가능</p>`;els.advanceBtn.innerHTML=`1차 도시 완성 <i data-lucide="arrow-right"></i>`;els.advanceBtn.disabled=state.grid.filter(Boolean).length<5;}
    else if(state.phase===2){els.phaseText.textContent="2단계 · 위기 직면 + 이론";els.missionTitle.textContent="성장 뒤에 숨은 비용을 해석하라";els.teacherNote.innerHTML=`<i data-lucide="triangle-alert"></i><p><strong>위기:</strong> 전력 · 탄소 · 냉각 · 잘못된 배치가 공개됨</p>`;els.advanceBtn.innerHTML=`개념 학습 <i data-lucide="brain"></i>`;els.advanceBtn.disabled=false;}
    else if(state.phase===3){els.phaseText.textContent="3단계 · 확장 + 재설계";els.missionTitle.textContent="6×6 영토에서 지식으로 도시를 재설계하라";els.teacherNote.innerHTML=`<i data-lucide="map"></i><p><strong>확장:</strong> +11칸 · Lv.3 · 친환경 시설 · 인접 설계 2개 이상</p>`;els.advanceBtn.innerHTML=`재설계 검증 <i data-lucide="badge-check"></i>`;els.advanceBtn.disabled=false;els.evidenceBox.classList.remove("hidden");}
    else{els.phaseText.textContent="4단계 · 결과 발표";els.missionTitle.textContent="AI를 어떻게 검증하고 재설계했는지 설명하라";els.teacherNote.innerHTML=`<i data-lucide="mic-2"></i><p><strong>발표:</strong> 배치 · 업그레이드 · 근거 · 결과를 비교</p>`;els.advanceBtn.innerHTML=`결과 다시 보기 <i data-lucide="presentation"></i>`;els.advanceBtn.disabled=false;}
    renderDock();renderGrid();updateChart(m);updateIcons();
  }

  function handleCellClick(index){
    state.selectedCell=index;const existing=state.grid[index];
    if(existing){openFacilityInspector(index);renderGrid();return;}
    if(![1,3].includes(state.phase)){renderGrid();return showToast("현재는 편집할 수 없습니다.");}
    const f=FACILITIES[state.selectedFacility];if(!f)return;if(state.credits<f.cost)return showToast("크레딧 부족",`${f.name} 건설: ${f.cost}C`);
    state.grid[index]={type:state.selectedFacility,level:1};state.credits-=f.cost;state.turn++;updateUI();beep();
    const cell=els.cityGrid.children[index];if(window.anime&&cell)anime({targets:cell,scale:[.78,1],duration:300,easing:"easeOutBack"});
    if(state.grid.filter(Boolean).length===5)unlockBadge("builder");checkSpatialAchievements();
  }

  function openFacilityInspector(index){
    const cell=state.grid[index];if(!cell)return;const f=FACILITIES[cell.type],s=cellStats(cell),sp=getCellSpatial(index),cap=Math.min(f.maxLevel,stageLevelCap());
    const canEdit=[1,3].includes(state.phase);const nextCost=upgradeCost(cell);const canLevel=cell.level<cap;const lockedByStage=cell.level>=cap && cell.level<f.maxLevel;
    const refund=Math.ceil(investedCost(cell)*.5);
    const positive=sp.positive.length?sp.positive.map(x=>`<span class="spatial-tag good">🔗 ${x}</span>`).join(""):`<span class="spatial-tag neutral">연결 보너스 없음</span>`;
    const warns=sp.warnings.map(x=>`<span class="spatial-tag warn">⚠ ${x}</span>`).join("");
    setModal(`
      <div class="modal-head"><div><span class="eyebrow">FACILITY</span><h2>${f.icon} ${f.name} · Lv.${cell.level}</h2></div><button class="icon-btn close-inspector"><i data-lucide="x"></i></button></div>
      <div class="facility-inspector-grid">
        <div><span>발전</span><strong>+${round1(s.dev)}</strong></div><div><span>전력</span><strong>${s.supply?`+${round1(s.supply)}`:`-${round1(s.demand)}`}</strong></div><div><span>탄소</span><strong>${round1(s.carbon)}</strong></div><div><span>물</span><strong>${round1(s.water)}</strong></div>
      </div>
      <div class="spatial-tags">${positive}${warns}</div>
      <div class="callout"><strong>공간 규칙</strong><p>${f.desc}</p></div>
      <div class="modal-actions facility-actions">
        <button class="btn secondary" id="demolishBtn" ${canEdit?"":"disabled"}><i data-lucide="trash-2"></i> 철거 +${refund}C</button>
        <button class="btn primary" id="upgradeBtn" ${canEdit&&canLevel&&state.credits>=nextCost?"":"disabled"}><i data-lucide="chevrons-up"></i> ${canLevel?`Lv.${cell.level+1} · ${nextCost}C`:(lockedByStage?"Lv.3 · 3단계 해금":"최대 레벨")}</button>
      </div>`);
    $(".close-inspector").addEventListener("click",closeModal);
    const d=$("#demolishBtn"),u=$("#upgradeBtn");if(d)d.addEventListener("click",()=>demolishCell(index));if(u)u.addEventListener("click",()=>upgradeCell(index));
  }

  function demolishCell(index){
    const cell=state.grid[index];if(!cell)return;const refund=Math.ceil(investedCost(cell)*.5),name=FACILITIES[cell.type].name;state.grid[index]=null;state.credits+=refund;state.turn++;closeModal();updateUI();showToast("철거 완료",`${name} 제거 · ${refund}C 환급`);beep(300,.06);
  }
  function upgradeCell(index){
    const cell=state.grid[index];if(!cell)return;const f=FACILITIES[cell.type],cap=Math.min(f.maxLevel,stageLevelCap());if(cell.level>=cap)return;const cost=upgradeCost(cell);if(state.credits<cost)return;
    state.credits-=cost;cell.level++;state.turn++;closeModal();updateUI();unlockBadge("upgrade");showToast("시설 업그레이드",`${f.name} → Lv.${cell.level}`);beep(820,.08);checkSpatialAchievements();
  }
  function checkSpatialAchievements(){const m=calcMetrics();if(m.synergyLinks>=2)unlockBadge("synergy");}

  const advisorAnswers={
    score:["초반에는 데이터센터·공장으로 성장점수를 확보하세요. 같은 시설이라도 Lv.2가 되면 더 강해집니다.","점수만 보면 고성장 시설이 유리합니다. 건물을 다시 눌러 업그레이드할 수 있습니다."],
    placement:["공장은 발전소 옆, 데이터센터는 순환냉각 옆에서 보너스를 얻습니다. 주거지와 공장·화력은 붙이지 않는 편이 좋습니다.","3단계에서는 태양광·풍력을 저장장치 옆에 두면 신뢰가능 전력이 높아집니다."],
    power:["전력수지는 공급−수요입니다. 데이터센터·공장 업그레이드는 수요도 함께 키웁니다.","재생에너지는 저장장치와 인접할 때 변동성 패널티가 크게 줄어듭니다."],
    rethink:["이번에는 점수만 묻지 말고 '전력수지≥0, 탄소·물 감소, 인접 보너스 2개'를 조건으로 대안을 검토하세요.","시설을 없애거나 강화하는 선택도 재설계입니다. 무엇을 왜 바꿨는지 근거를 남기세요."]
  };
  function askAdvisor(type="score"){
    state.advisorQuestions++;const user={score:"점수 전략?",placement:"배치 전략?",power:"전력 전략?",rethink:"재설계 전략?"}[type]||"도시 전략?";const a=advisorAnswers[type]||advisorAnswers.score,ans=a[(state.advisorQuestions-1)%a.length];
    els.advisorLog.insertAdjacentHTML("beforeend",`<div class="message user"><b>시장</b><p>${user}</p></div><div class="message ai"><b>AI</b><p>${ans}</p></div>`);els.advisorLog.scrollTop=els.advisorLog.scrollHeight;if(window.anime)anime({targets:els.advisorLog.lastElementChild,opacity:[0,1],translateY:[8,0],duration:220});
  }

  function revealCrisis(){
    state.baseline=calcMetrics();state.firstCitySnapshot=state.grid.map(c=>c?{...c}:null);state.phase=2;unlockBadge("crisis");const m=state.baseline;
    els.boardOverlay.classList.remove("hidden");if(window.anime){anime({targets:".left-panel",translateX:[0,-7,7,-4,4,0],duration:500});anime({targets:".crisis-stamp",scale:[1.4,1],opacity:[0,1],duration:400,easing:"easeOutBack"});}
    setModal(`<div class="modal-head"><div><span class="eyebrow">CITY CRISIS</span><h2>성장 뒤의 비용이 공개되었습니다</h2></div></div>
      <div class="crisis-grid"><div class="crisis-card"><div class="value">${m.reliableSupply}/${m.demand}</div><h3>⚡ 전력</h3><p>수지 ${m.balance}</p></div><div class="crisis-card"><div class="value">${m.carbon}</div><h3>☁ 탄소</h3><p>화력·산업 영향</p></div><div class="crisis-card"><div class="value">${m.water}</div><h3>💧 냉각</h3><p>열집중 ${m.heatCluster}</p></div></div>
      <div class="crisis-grid"><div class="crisis-card"><div class="value">${m.synergyLinks}</div><h3>🔗 인접 연결</h3><p>좋은 배치</p></div><div class="crisis-card"><div class="value">${m.conflictPairs}</div><h3>⚠ 배치 갈등</h3><p>주거-산업 충돌</p></div><div class="crisis-card"><div class="value">${m.synergyScore}</div><h3>★ 공간 보너스</h3><p>인접 효과 점수</p></div></div>
      <div class="callout"><strong>핵심</strong><p>시설 종류뿐 아니라 <b>어디에 배치했는지</b>가 도시 성능을 바꿉니다.</p></div><div class="modal-actions"><button class="btn primary" id="toLearningBtn">원인 학습 <i data-lucide="brain"></i></button></div>`);
    $("#toLearningBtn").addEventListener("click",()=>{closeModal();els.boardOverlay.classList.add("hidden");updateUI();openQuiz();});updateUI();
  }

  const QUIZ=[
    {title:"전력수지",prompt:()=>`신뢰가능 공급 ${state.baseline.reliableSupply}, 수요 ${state.baseline.demand}. 전력수지는?`,options:()=>{const b=round1(state.baseline.reliableSupply-state.baseline.demand);return[{text:`${b}; 음수면 공급 부족`,correct:true},{text:`${state.baseline.demand}; 클수록 안정`,correct:false},{text:`${round1(state.baseline.reliableSupply+state.baseline.demand)}; 0이면 안정`,correct:false},{text:`${state.baseline.dev}; 발전점수와 동일`,correct:false}]},explain:"전력수지 = 공급−수요. 시설 업그레이드가 수요를 키울 수 있다는 점도 함께 봅니다."},
    {title:"공간 배치",prompt:()=>"공장이 발전소와 인접할 때 생산 보너스를 주는 규칙의 학습 의미로 가장 적절한 것은?",options:()=>[{text:"시설의 기능은 종류뿐 아니라 공간적 연결과 기반시설에 좌우될 수 있음을 표현한다.",correct:true},{text:"실제 모든 공장은 반드시 발전소 바로 옆에 있어야 한다.",correct:false},{text:"발전소가 공장의 원료를 직접 생산한다.",correct:false},{text:"인접하면 전력 손실이 항상 0이 된다.",correct:false}],explain:"게임의 인접 규칙은 실제 거리를 그대로 재현한 것이 아니라 기반시설·연결성을 공간적으로 사고하게 하는 모델입니다."},
    {title:"데이터센터 냉각",prompt:()=>"데이터센터를 순환냉각 시설과 연결했을 때 냉각 부담을 줄이는 이유는?",options:()=>[{text:"서버 연산에서 발생한 열을 제거하는 냉각 과정이 필요하기 때문",correct:true},{text:"데이터센터가 전기를 생산하기 때문",correct:false},{text:"AI가 물을 연산 매체로 사용하기 때문",correct:false},{text:"냉각은 전력 사용과 무관하기 때문",correct:false}],explain:"AI 사용→연산→서버 발열→냉각이라는 물리적 연결을 모델링합니다."},
    {title:"검증형 AI 질문",prompt:()=>"3단계에서 가장 좋은 AI 질문은?",options:()=>[{text:"전력수지≥0, 탄소·물 감소, 인접 보너스 2개 이상을 만족하는 재설계안을 장단점과 함께 제시해줘.",correct:true},{text:"점수가 제일 높은 도시를 만들어줘.",correct:false},{text:"네가 알아서 좋은 도시를 만들어줘.",correct:false},{text:"1차시 답을 그대로 반복해줘.",correct:false}],explain:"사람이 과학 개념으로 조건을 만들고 AI 답을 검증하는 것이 핵심입니다."}
  ];
  function openQuiz(){state.quizIndex=0;state.quizCorrect=0;state.quizAnswered=false;renderQuiz();}
  function renderQuiz(){
    const q=QUIZ[state.quizIndex],opts=q.options();setModal(`<div class="modal-head"><div><span class="eyebrow">CONCEPT UNLOCK</span><h2>${q.title}</h2></div></div><div class="quiz-progress">${QUIZ.map((_,i)=>`<span class="${i<state.quizIndex?"done":i===state.quizIndex?"current":""}"></span>`).join("")}</div><div class="quiz-question"><h3>${q.prompt()}</h3><div class="quiz-options" id="quizOptions">${opts.map((o,i)=>`<button class="quiz-option" data-i="${i}">${String.fromCharCode(65+i)}. ${o.text}</button>`).join("")}</div><div id="quizExplain"></div></div><div class="modal-actions"><button class="btn primary" id="quizNextBtn" disabled>${state.quizIndex===QUIZ.length-1?"결과":"다음"}</button></div>`);
    $$("#quizOptions .quiz-option").forEach(btn=>btn.addEventListener("click",()=>{if(state.quizAnswered)return;state.quizAnswered=true;const i=Number(btn.dataset.i),ok=opts[i].correct;if(ok){state.quizCorrect++;btn.classList.add("correct");beep(720,.07);}else{btn.classList.add("wrong");$$("#quizOptions .quiz-option")[opts.findIndex(o=>o.correct)].classList.add("correct");beep(220,.09);}$("#quizExplain").innerHTML=`<div class="quiz-explain"><strong>${ok?"정답":"오답"}</strong><br>${q.explain}</div>`;$("#quizNextBtn").disabled=false;}));
    $("#quizNextBtn").addEventListener("click",()=>{if(!state.quizAnswered)return;if(state.quizIndex<QUIZ.length-1){state.quizIndex++;state.quizAnswered=false;renderQuiz();}else finishQuiz();});
  }
  function finishQuiz(){
    const pass=state.quizCorrect>=3;setModal(`<div class="modal-head"><div><span class="eyebrow">LEARNING RESULT</span><h2>${pass?"도시 확장권 획득":"개념 재도전"}</h2></div></div><div class="summary-grid"><div class="summary-card"><span>정답</span><strong>${state.quizCorrect}/4</strong></div><div class="summary-card"><span>영토</span><strong>${pass?"6×6":"5×5"}</strong></div><div class="summary-card"><span>시설</span><strong>${pass?"+5종":"잠김"}</strong></div><div class="summary-card"><span>강화</span><strong>${pass?"Lv.3":"Lv.2"}</strong></div></div><div class="callout"><strong>${pass?"3단계 보상":"3문항 이상 필요"}</strong><p>${pass?"+11칸, 친환경 시설, Lv.3 업그레이드가 열립니다.":"틀린 문항 설명을 확인한 뒤 다시 도전하세요."}</p></div><div class="modal-actions"><button class="btn primary" id="quizFinishBtn">${pass?"영토 확장":"다시 풀기"}</button></div>`);
    $("#quizFinishBtn").addEventListener("click",()=>{if(pass){unlockBadge("scholar");state.phase=3;state.credits+=24;expandGrid(6);state.selectedFacility="solar";closeModal();els.promptChips.innerHTML=`<button data-prompt="rethink">🧠 재설계</button><button data-prompt="placement">🔗 인접</button><button data-prompt="power">⚡ 전력</button>`;bindPromptChips();askAdvisor("rethink");updateUI();showToast("영토 확장 + 재설계 예산",`5×5 → 6×6 · +11칸 · +24C · Lv.3 해금`);}else openQuiz();});
  }
  function expandGrid(newSize){
    const oldSize=state.gridSize,old=state.grid,newGrid=Array(newSize*newSize).fill(null),newCells=new Set();
    for(let r=0;r<oldSize;r++)for(let c=0;c<oldSize;c++)newGrid[r*newSize+c]=old[r*oldSize+c];
    for(let r=0;r<newSize;r++)for(let c=0;c<newSize;c++)if(r>=oldSize||c>=oldSize)newCells.add(r*newSize+c);
    state.gridSize=newSize;state.grid=newGrid;state.expandedCells=newCells;unlockBadge("expansion");setTimeout(()=>{state.expandedCells.clear();renderGrid();},4200);
  }

  function validateRedesign(){
    const m=calcMetrics(),b=state.baseline,good=state.evidence.filter(e=>e.good).length;const checks=[
      {label:"전력수지",ok:m.balance>=0,text:`${m.balance}`},{label:"탄소",ok:m.carbon<b.carbon||m.carbon<=10,text:`${b.carbon}→${m.carbon}`},{label:"냉각·물",ok:m.water<b.water||m.water<=12,text:`${b.water}→${m.water}`},{label:"인접 설계",ok:m.synergyLinks>=2,text:`연결 ${m.synergyLinks}개`},{label:"과학 근거",ok:good>=3,text:`인정 ${good}개`},{label:"도시 기능",ok:m.dev>=Math.max(28,b.dev*.72),text:`${b.dev}→${m.dev}`}
    ];const passed=checks.filter(c=>c.ok).length,all=passed===checks.length;if(m.synergyLinks>=2)unlockBadge("synergy");
    setModal(`<div class="modal-head"><div><span class="eyebrow">REDESIGN CHECK</span><h2>${all?"재설계 성공":`${passed}/${checks.length} 조건 충족`}</h2></div></div><div class="rubric">${checks.map(c=>`<div class="rubric-row"><strong>${c.label}</strong><div class="rubric-meter"><span style="width:${c.ok?100:24}%"></span></div><span>${c.ok?"PASS":"RETRY"}</span></div><div class="muted validation-note">${c.text}</div>`).join("")}</div><div class="callout"><strong>${all?"도시는 공간적 시스템입니다.":"부족한 조건을 다시 설계하세요."}</strong><p>${all?"배치, 연결, 강화, 환경 지표를 함께 만족시켰습니다.":"건물 터치로 철거·업그레이드하고 인접 관계를 다시 확인하세요."}</p></div><div class="modal-actions"><button class="btn ${all?"primary":"secondary"}" id="validationBtn">${all?"최종 결과":"계속 재설계"}</button></div>`);
    $("#validationBtn").addEventListener("click",()=>{if(all){state.phase=4;unlockBadge("mayor");closeModal();updateUI();showFinal();}else closeModal();});
  }

  function showFinal(){
    const m=calcMetrics(),b=state.baseline,good=state.evidence.filter(e=>e.good).length;const science=clamp(100-Math.max(0,-m.balance)*8-m.carbon*2.2-Math.max(0,m.water-10)*2,0,100),spatial=clamp(m.synergyLinks*18-m.conflictPairs*12,0,100),autonomy=clamp(good*24+(state.advisorQuestions>=2?10:4),0,100),total=Math.round(science*.4+spatial*.25+autonomy*.25+clamp(m.dev,0,100)*.1);const rank=total>=85?["🏆","진짜 시장"]:total>=70?["🥇","검증형 시장"]:["🧭","성찰형 시장"];
    setModal(`<div class="modal-head"><div><span class="eyebrow">FINAL REPORT</span><h2>1차 도시 → 확장 도시</h2></div></div><div class="final-rank"><div class="rank-icon">${rank[0]}</div><h2>${rank[1]} · ${total}점</h2><p>시설 종류뿐 아니라 배치·강화·환경 지표를 함께 관리했습니다.</p></div><div class="summary-grid"><div class="summary-card"><span>발전</span><strong>${b.dev}→${m.dev}</strong></div><div class="summary-card"><span>전력수지</span><strong>${b.balance}→${m.balance}</strong></div><div class="summary-card"><span>탄소</span><strong>${b.carbon}→${m.carbon}</strong></div><div class="summary-card"><span>인접 연결</span><strong>${m.synergyLinks}</strong></div></div><div class="rubric"><div class="rubric-row"><strong>과학 타당성</strong><div class="rubric-meter"><span style="width:${science}%"></span></div><span>${Math.round(science)}</span></div><div class="rubric-row"><strong>공간 설계</strong><div class="rubric-meter"><span style="width:${spatial}%"></span></div><span>${Math.round(spatial)}</span></div><div class="rubric-row"><strong>AI 주체성</strong><div class="rubric-meter"><span style="width:${autonomy}%"></span></div><span>${Math.round(autonomy)}</span></div></div><div class="modal-actions"><button class="btn secondary" id="exportBtn"><i data-lucide="download"></i> 결과 저장</button><button class="btn primary" id="closeFinalBtn">돌아가기</button></div>`);
    $("#closeFinalBtn").addEventListener("click",closeModal);$("#exportBtn").addEventListener("click",exportResult);
  }
  function exportResult(){const result={title:"AI 시티를 구하라!",note:"교수학습용 게임 상대값",gridSize:state.gridSize,phase1:state.baseline,final:calcMetrics(),grid:state.grid,evidence:state.evidence,badges:[...state.badges],createdAt:new Date().toISOString()};const blob=new Blob([JSON.stringify(result,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="ai-city-result.json";a.click();URL.revokeObjectURL(url);}

  function saveEvidence(){
    if(state.phase!==3)return;if(state.selectedCell==null||!state.grid[state.selectedCell])return showToast("시설을 먼저 선택하세요.");const cell=state.grid[state.selectedCell],type=cell.type,concept=els.evidenceConcept.value,reason=els.evidenceReason.value.trim();if(!concept||reason.length<15)return showToast("근거를 구체화하세요.","개념 선택 + 15자 이상");
    const matches={solar:["carbon","renewable","balance"],wind:["renewable","balance","carbon"],battery:["balance","renewable","efficiency"],cooling:["cooling","efficiency"],green:["carbon"],thermal:["balance","efficiency","carbon"],nuclear:["balance","cooling"],data:["cooling","balance","efficiency"],factory:["balance","carbon","efficiency"],residential:["balance","efficiency"]};const good=(matches[type]||[]).includes(concept),label=els.evidenceConcept.options[els.evidenceConcept.selectedIndex].text;
    state.evidence.push({cell:state.selectedCell+1,facility:FACILITIES[type].name,level:cell.level,concept,conceptLabel:label,reason,good});els.evidenceReason.value="";els.evidenceConcept.value="";renderEvidence();showToast(good?"근거 기록":"근거 보완 필요",`${FACILITIES[type].name} ↔ ${label}`);
  }

  function updateChart(m){
    const values=[clamp(m.dev,0,100),clamp(m.reliability,0,100),clamp(100-m.carbon*4,0,100),clamp(100-m.water*4,0,100),clamp(m.synergyLinks*20,0,100)];
    if(window.Chart){els.chartFallback.classList.add("hidden");const ctx=$("#cityChart");if(!state.chart)state.chart=new Chart(ctx,{type:"radar",data:{labels:["발전","전력안정","저탄소","물관리","공간연결"],datasets:[{data:values,borderWidth:2,pointRadius:2,backgroundColor:"rgba(84,228,255,.10)",borderColor:"rgba(84,228,255,.85)",pointBackgroundColor:"rgba(113,245,180,1)"}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:320},scales:{r:{min:0,max:100,ticks:{display:false},grid:{color:"rgba(255,255,255,.08)"},angleLines:{color:"rgba(255,255,255,.08)"},pointLabels:{color:"#a8bdd0",font:{size:11}}}},plugins:{legend:{display:false}}}});else{state.chart.data.datasets[0].data=values;state.chart.update();}}
    else{$("#cityChart").classList.add("hidden");els.chartFallback.classList.remove("hidden");const labels=["발전","전력안정","저탄소","물관리","공간연결"];els.chartFallback.innerHTML=labels.map((l,i)=>`<div class="fallback-bar"><span>${l}</span><div class="fallback-track"><span style="width:${values[i]}%"></span></div><b>${Math.round(values[i])}</b></div>`).join("");}
  }

  function initThree(){if(!window.THREE)return;const canvas=$("#threeBg"),renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.1,100);camera.position.set(0,2.6,8);const geo=new THREE.IcosahedronGeometry(2.1,1),mat=new THREE.MeshBasicMaterial({color:0x1c8fe8,wireframe:true,transparent:true,opacity:.11}),mesh=new THREE.Mesh(geo,mat);mesh.position.set(4.8,-1.7,-1);scene.add(mesh);const pg=new THREE.BufferGeometry(),pts=[];for(let i=0;i<180;i++)pts.push((Math.random()-.5)*18,(Math.random()-.5)*12,(Math.random()-.5)*8);pg.setAttribute("position",new THREE.Float32BufferAttribute(pts,3));const stars=new THREE.Points(pg,new THREE.PointsMaterial({color:0x70eaff,size:.025,transparent:true,opacity:.4}));scene.add(stars);function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener("resize",resize);resize();let t=0;(function loop(){t+=.004;mesh.rotation.x=t*.5;mesh.rotation.y=t;stars.rotation.y=t*.06;renderer.render(scene,camera);requestAnimationFrame(loop);})();}
  function bindPromptChips(){$$("#promptChips button").forEach(b=>b.addEventListener("click",()=>askAdvisor(b.dataset.prompt)));}

  els.aiAdviceBtn.addEventListener("click",()=>askAdvisor(state.phase>=3?"rethink":"score"));
  els.advanceBtn.addEventListener("click",()=>{if(state.phase===1)revealCrisis();else if(state.phase===2)openQuiz();else if(state.phase===3)validateRedesign();else showFinal();});
  els.saveEvidenceBtn.addEventListener("click",saveEvidence);
  $("#helpBtn").addEventListener("click",()=>{setModal($("#helpTemplate").innerHTML);$(".close-modal").addEventListener("click",closeModal);});
  $("#soundBtn").addEventListener("click",()=>{state.sound=!state.sound;$("#soundBtn").innerHTML=`<i data-lucide="${state.sound?"volume-2":"volume-x"}"></i>`;updateIcons();});
  $("#resetBtn").addEventListener("click",()=>{setModal(`<div class="modal-head"><div><span class="eyebrow">RESET</span><h2>처음부터 다시 시작?</h2></div></div><p class="muted">도시·업그레이드·근거·성취가 초기화됩니다.</p><div class="modal-actions"><button class="btn secondary" id="cancelReset">취소</button><button class="btn primary" id="confirmReset">초기화</button></div>`);$("#cancelReset").addEventListener("click",closeModal);$("#confirmReset").addEventListener("click",()=>location.reload());});
  els.modal.addEventListener("click",e=>{if(e.target.classList.contains("modal-backdrop"))closeModal();});

  // 모바일 하단 drawer
  const bar=$(".mobile-bar"),panel=els.rightPanel;if(bar&&panel){const buttons=[...bar.querySelectorAll("[data-open-panel]")],sections=[...panel.querySelectorAll("[data-mobile-panel]")],evidenceBtn=$("#mobileEvidenceBtn");function sync(){if(evidenceBtn)evidenceBtn.style.opacity=els.evidenceBox.classList.contains("hidden")?".35":"1";}function openPanel(name,btn){if(name==="evidence"&&els.evidenceBox.classList.contains("hidden"))return;const same=panel.classList.contains("mobile-open")&&btn.classList.contains("active");buttons.forEach(b=>b.classList.remove("active"));sections.forEach(s=>s.classList.remove("mobile-active"));if(same){panel.classList.remove("mobile-open");return;}const target=sections.find(s=>s.dataset.mobilePanel===name);if(!target)return;target.classList.add("mobile-active");btn.classList.add("active");panel.classList.add("mobile-open");if(name==="status")setTimeout(()=>dispatchEvent(new Event("resize")),60);}buttons.forEach(btn=>btn.addEventListener("click",()=>openPanel(btn.dataset.openPanel,btn)));new MutationObserver(sync).observe(els.evidenceBox,{attributes:true,attributeFilter:["class"]});sync();}

  function simulateLoading(){[[24,"도시 보드 구성…"],[48,"공간 규칙 연결…"],[72,"시각화 로딩…"],[92,"미션 준비…"],[100,"AI CITY 준비 완료"]].forEach(([p,t],i)=>setTimeout(()=>{els.loadingBar.style.width=`${p}%`;els.loadingText.textContent=t;if(p===100)setTimeout(()=>els.loading.classList.add("done"),300);},i*220));}
  function init(){renderBadges();renderEvidence();updateUI();bindPromptChips();initThree();updateIcons();simulateLoading();setTimeout(()=>showToast("시장 임명 완료","빈 칸=건설 · 건물 터치=업그레이드/철거 · 🔗=인접 보너스"),1200);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
