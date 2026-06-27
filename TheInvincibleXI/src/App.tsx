import { useState, useMemo, useEffect } from "react";
import { Sun, Moon, Shuffle, Trophy, Share2, RefreshCw, ArrowLeftRight, Play, Repeat, Clock, Sparkles, Search, Wand2, Eye, EyeOff, ChevronDown, Check, Volume2, VolumeX } from "lucide-react";

/* ---------- Switch-style sound engine (Web Audio, fully synthesized — no assets) ---------- */
const sfx=(()=>{
  let ctx:AudioContext|null=null, master:GainNode|null=null, on=true;
  const ac=()=>{ if(typeof window==="undefined")return null;
    if(!ctx){ const AC=(window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext); if(!AC)return null; ctx=new AC(); master=ctx.createGain(); master.gain.value=0.5; master.connect(ctx.destination); }
    if(ctx.state==="suspended")ctx.resume();
    return ctx; };
  const tone=(freq:number,dur:number,type:OscillatorType,vol:number,delay=0,glide?:number)=>{
    const c=ac(); if(!c||!on||!master)return; const t=c.currentTime+delay;
    const o=c.createOscillator(), g=c.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t);
    if(glide)o.frequency.exponentialRampToValueAtTime(Math.max(50,glide),t+dur);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+0.006); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.03);
  };
  const noise=(dur:number,vol:number,hp:number,delay=0)=>{
    const c=ac(); if(!c||!on||!master)return; const t=c.currentTime+delay;
    const n=Math.max(1,Math.floor(c.sampleRate*dur)); const buf=c.createBuffer(1,n,c.sampleRate); const d=buf.getChannelData(0);
    for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,2.5);
    const s=c.createBufferSource(); s.buffer=buf; const f=c.createBiquadFilter(); f.type="highpass"; f.frequency.value=hp;
    const g=c.createGain(); g.gain.value=vol; s.connect(f); f.connect(g); g.connect(master); s.start(t);
  };
  return {
    resume(){ac();},
    setOn(v:boolean){on=v; if(v)ac();},
    isOn(){return on;},
    tap(){tone(740,0.05,"triangle",0.15); noise(0.018,0.05,2400);},                         // crisp nav click
    select(){tone(620,0.05,"triangle",0.16); tone(1040,0.08,"triangle",0.14,0.045); noise(0.018,0.04,2000);}, // confirm
    toggle(){tone(560,0.05,"sine",0.14); tone(840,0.06,"sine",0.11,0.04);},
    place(){tone(300,0.09,"sine",0.18,0,210); noise(0.03,0.06,1100);},                       // soft thunk
    reel(){noise(0.016,0.045,2600); tone(1500,0.014,"square",0.035);},                        // reel tick
    lock(){tone(700,0.05,"triangle",0.19); tone(1080,0.1,"triangle",0.16,0.05); noise(0.02,0.05,1800);}, // reel stop
    success(){[523.25,659.25,783.99,1046.5].forEach((f,i)=>tone(f,0.22,"triangle",0.15,i*0.08));},
    fanfare(){[523,659,784,1046,1318].forEach((f,i)=>tone(f,0.32,"triangle",0.16,i*0.1)); noise(0.5,0.025,3200,0.05);},
    thud(){tone(190,0.26,"sine",0.15,0,120);},
  };
})();


/* ---------- types ---------- */
type Role = "GK"|"LB"|"CB"|"RB"|"LWB"|"RWB"|"WB"|"CDM"|"CM"|"CAM"|"LM"|"RM"|"LW"|"RW"|"ST"|"CF";
type Unit = "gk"|"def"|"mid"|"att";
interface Club { name: string; league: string; c: string[]; }
interface Player { id: string; n: string; b: Role[]; o: Role[]; ov: number; ar: string; ic: boolean; _src?: { club: string; era: string }; }
interface Roster { club: string; era: string; note: string; players: Player[]; }
interface Slot { idx: number; role: Role; player: Player | null; }
interface SimResult {
  W: number; D: number; Lo: number; GF: number; GA: number; pts: number;
  log: { gf: number; ga: number; res: string }[];
  chem: number; icons: number;
  units: { gk: number; def: number; mid: number; att: number };
}

/* 38-0 — PL · LaLiga (full) + Ligue 1 · Bundesliga · Serie A (lean). Representative stats; stylised crests. */
const CLUBS: Record<string, Club> = {
  ARS:{name:"Arsenal",league:"Premier League",c:["#EF0107","#9C824A"]},MUN:{name:"Man United",league:"Premier League",c:["#DA291C","#FBE122"]},MCI:{name:"Man City",league:"Premier League",c:["#6CABDD","#1C2C5B"]},LIV:{name:"Liverpool",league:"Premier League",c:["#C8102E","#00B2A9"]},CHE:{name:"Chelsea",league:"Premier League",c:["#034694","#DBA111"]},TOT:{name:"Tottenham",league:"Premier League",c:["#132257","#ffffff"]},
  OM:{name:"Marseille",league:"Ligue 1",c:["#2FAEE0","#ffffff"]},OL:{name:"Lyon",league:"Ligue 1",c:["#0033A0","#DA291C"]},ASM:{name:"Monaco",league:"Ligue 1",c:["#E51B22","#ffffff"]},LIL:{name:"Lille",league:"Ligue 1",c:["#E01E13","#0a2240"]},PSG:{name:"PSG",league:"Ligue 1",c:["#004170","#DA291C"]},
  BAY:{name:"Bayern",league:"Bundesliga",c:["#DC052D","#0066B2"]},B04:{name:"Leverkusen",league:"Bundesliga",c:["#E32219","#111111"]},BVB:{name:"Dortmund",league:"Bundesliga",c:["#FDE100","#111111"]},WOB:{name:"Wolfsburg",league:"Bundesliga",c:["#65B32E","#ffffff"]},S04:{name:"Schalke",league:"Bundesliga",c:["#004D9D","#ffffff"]},RBL:{name:"RB Leipzig",league:"Bundesliga",c:["#DD0741","#001F47"]},
  ROM:{name:"Roma",league:"Serie A",c:["#8E1F2F","#F0BC42"]},LAZ:{name:"Lazio",league:"Serie A",c:["#3FB5E8","#0a2240"]},NAP:{name:"Napoli",league:"Serie A",c:["#12A0D7","#003C82"]},MIL:{name:"AC Milan",league:"Serie A",c:["#FB090B","#111111"]},INT:{name:"Inter",league:"Serie A",c:["#0068A8","#111111"]},JUV:{name:"Juventus",league:"Serie A",c:["#111111","#cccccc"]},ATA:{name:"Atalanta",league:"Serie A",c:["#1E71B8","#111111"]},FIO:{name:"Fiorentina",league:"Serie A",c:["#592C82","#ffffff"]},
  ATM:{name:"Atlético",league:"LaLiga",c:["#CB3524","#262E62"]},BAR:{name:"Barcelona",league:"LaLiga",c:["#A50044","#004D98"]},RMA:{name:"Real Madrid",league:"LaLiga",c:["#FEBE10","#00529F"]},VAL:{name:"Valencia",league:"LaLiga",c:["#FF7F00","#111111"]},SEV:{name:"Sevilla",league:"LaLiga",c:["#D81920","#ffffff"]},
};
const P=(id:string,n:string,b:Role[],o:Role[],ov:number,ar:string,ic?:boolean):Player=>({id,n,b,o:o||[],ov,ar,ic:!!ic});

const ROSTERS:Roster[]=[
/* ARSENAL */
{club:"ARS",era:"90s",note:"Graham & early Wenger",players:[P("seaman","David Seaman",["GK"],[],86,"keeper"),P("adams","Tony Adams",["CB"],[],85,"wall"),P("keown","Martin Keown",["CB"],[],81,"wall"),P("dixon","Lee Dixon",["RB"],[],80,"fullback"),P("vieira","Patrick Vieira ('99)",["CM","CDM"],[],85,"engine"),P("platt","David Platt",["CM","CAM"],[],82,"box2box"),P("overmars","Marc Overmars",["LW"],["RW"],84,"pace"),P("bergkamp","Dennis Bergkamp",["CF","CAM"],["ST"],88,"creator"),P("wright","Ian Wright",["ST"],[],84,"poacher")]},
{club:"ARS",era:"00s",note:"The Invincibles",players:[P("lehmann","Jens Lehmann",["GK"],[],85,"keeper"),P("solcampbell","Sol Campbell ('04)",["CB"],[],85,"wall"),P("kolo","Kolo Touré",["CB"],["RB"],83,"wall"),P("ashleycole","Ashley Cole ('06)",["LB"],[],85,"fullback"),P("vieira","Patrick Vieira ('04)",["CM","CDM"],[],88,"engine"),P("fabregas","Cesc Fàbregas ('08)",["CM","CAM"],[],86,"playmaker"),P("pires","Robert Pirès",["LW","CAM"],[],85,"creator"),P("ljungberg","Freddie Ljungberg",["RM","RW"],["CAM"],82,"winger"),P("rvp","Robin van Persie ('08)",["ST"],["LW"],84,"complete"),P("adebayor","Emmanuel Adebayor",["ST"],[],82,"power"),P("henry","Thierry Henry ('04)",["ST"],["LW"],91,"complete",true)]},
  {club:"ARS",era:"10s",note:"Wenger's nearly-men",players:[P("cech","Petr Čech",["GK"],[],85,"keeper"),P("mertesacker","Per Mertesacker",["CB"],[],81,"wall"),P("koscielny","Laurent Koscielny",["CB"],[],83,"wall"),P("monreal","Nacho Monreal",["LB"],["CB"],80,"fullback"),P("bellerin","Héctor Bellerín",["RB"],[],81,"fullback"),P("cazorla","Santi Cazorla",["CM","CAM"],[],84,"playmaker"),P("ozil","Mesut Özil ('16)",["CAM"],[],87,"playmaker"),P("walcott","Theo Walcott",["RW","ST"],[],80,"pace"),P("sanchez","Alexis Sánchez ('17)",["LW","ST"],["RW"],87,"complete"),P("aubameyang","Aubameyang ('19)",["ST"],["LW"],85,"pace"),P("giroud","Olivier Giroud",["ST"],[],84,"power"),P("wilshere","Jack Wilshere",["CM","CAM"],[],80,"playmaker")]},
{club:"ARS",era:"20s",note:"Arteta's rebuild",players:[P("raya","David Raya",["GK"],[],84,"sweeperk"),P("saliba","William Saliba",["CB"],[],85,"ballplayer"),P("gabriel","Gabriel Magalhães",["CB"],[],84,"wall"),P("calafiori","Riccardo Calafiori",["CB","LB"],[],83,"ballplayer"),P("hincapie","Piero Hincapié",["CB","LB"],[],82,"wall"),P("timber","Jurriën Timber",["RB","CB"],[],83,"fullback"),P("zubimendi","Martín Zubimendi",["CDM"],["CM"],84,"anchor"),P("rice","Declan Rice",["CDM","CM"],[],88,"anchor"),P("merino","Mikel Merino",["CM"],["CAM"],83,"box2box"),P("odegaard","Martin Ødegaard",["CAM"],["CM"],87,"playmaker"),P("saka","Bukayo Saka",["RW"],["LW"],87,"winger"),P("martinelli","Gabriel Martinelli",["LW"],["ST"],83,"pace"),P("gyokeres","Viktor Gyökeres",["ST"],[],85,"poacher")]},
/* MAN UNITED */
{club:"MUN",era:"90s",note:"Treble winners",players:[P("schmeichel","Peter Schmeichel",["GK"],[],90,"keeper"),P("stam","Jaap Stam",["CB"],[],88,"wall"),P("bruce","Steve Bruce",["CB"],[],82,"wall"),P("gneville","Gary Neville",["RB"],[],81,"fullback"),P("irwin","Denis Irwin",["LB"],["RB"],82,"fullback"),P("keane","Roy Keane",["CM","CDM"],[],88,"engine"),P("scholes","Paul Scholes",["CM"],["CAM"],85,"playmaker"),P("beckham","David Beckham",["RM","CM"],[],85,"winger"),P("giggs","Ryan Giggs",["LW","LM"],[],86,"winger"),P("cantona","Eric Cantona ('96)",["CF","ST"],[],88,"creator"),P("yorke","Dwight Yorke",["ST"],[],83,"poacher"),P("cole","Andy Cole",["ST"],[],84,"poacher"),P("sheringham","Teddy Sheringham",["ST","CF"],[],83,"creator")]},
{club:"MUN",era:"00s",note:"Ronaldo & Rooney",players:[P("vandersar","Edwin van der Sar",["GK"],[],88,"keeper"),P("ferdinand","Rio Ferdinand",["CB"],[],86,"ballplayer"),P("vidic","Nemanja Vidić",["CB"],[],85,"wall"),P("evra","Patrice Evra",["LB"],[],82,"fullback"),P("carrick","Michael Carrick",["CM","CDM"],[],82,"playmaker"),P("scholes","Paul Scholes ('07)",["CM"],["CAM"],85,"playmaker"),P("giggs","Ryan Giggs ('08)",["LW","LM"],[],84,"winger"),P("park","Ji-Sung Park",["LM","RM"],["CM"],80,"engine"),P("rooney","Wayne Rooney ('08)",["ST","CAM"],[],87,"complete"),P("tevez","Carlos Tévez",["ST"],[],84,"power"),P("cr7","Cristiano Ronaldo ('08)",["LW","ST"],["RW"],90,"complete",true)]},
{club:"MUN",era:"10s",note:"Post-Fergie flux",players:[P("degea","David de Gea ('18)",["GK"],[],88,"keeper"),P("vidic","Nemanja Vidić ('12)",["CB"],[],84,"wall"),P("bailly","Eric Bailly",["CB"],[],80,"wall"),P("philjones","Phil Jones",["CB"],["RB"],78,"wall"),P("herrera","Ander Herrera",["CM"],[],81,"engine"),P("schweinsteiger","Bastian Schweinsteiger ('16)",["CM"],["CDM"],82,"engine"),P("carrick","Michael Carrick ('13)",["CM","CDM"],[],82,"playmaker"),P("pogba","Paul Pogba",["CM","CAM"],[],86,"box2box"),P("dimaria","Ángel Di María ('15)",["RW","LW"],["CAM"],83,"winger"),P("rooney","Wayne Rooney ('12)",["ST","CAM"],[],85,"complete"),P("rvp","Robin van Persie ('13)",["ST"],["LW"],86,"complete"),P("zlatan","Zlatan Ibrahimović ('16)",["ST"],[],85,"power"),P("berbatov","Dimitar Berbatov ('11)",["ST","CF"],[],83,"creator"),P("rashford","Marcus Rashford",["LW","ST"],[],83,"pace")]},
{club:"MUN",era:"20s",note:"Amorim's reset",players:[P("lammens","Senne Lammens",["GK"],[],80,"keeper"),P("deligt","Matthijs de Ligt",["CB"],[],84,"wall"),P("yoro","Leny Yoro",["CB"],[],81,"sweeper"),P("maguire","Harry Maguire",["CB"],[],80,"wall"),P("mazraoui","Noussair Mazraoui",["RB"],["RWB"],81,"fullback"),P("casemiro","Casemiro",["CDM"],["CM"],84,"anchor"),P("bruno","Bruno Fernandes",["CAM","CM"],[],87,"playmaker"),P("mbeumo","Bryan Mbeumo",["RW"],["ST"],84,"winger"),P("amad","Amad Diallo",["RW"],[],82,"winger"),P("cunha","Matheus Cunha",["ST","CAM"],[],83,"complete"),P("sesko","Benjamin Šeško",["ST"],[],82,"power")]},
/* MAN CITY */
{club:"MCI",era:"90s",note:"Pre-oil collapse",players:[P("dibble","Andy Dibble",["GK"],[],73,"keeper"),P("symons","Kit Symons",["CB"],[],72,"wall"),P("kinkladze","Georgi Kinkladze",["CAM"],["LW"],80,"magician"),P("dickov","Paul Dickov",["ST"],[],72,"poacher"),P("rosler","Uwe Rösler",["ST"],[],74,"poacher"),P("quinn","Niall Quinn",["ST"],[],76,"power"),P("goater","Shaun Goater",["ST"],[],73,"poacher")]},
{club:"MCI",era:"00s",note:"Robinho dawn",players:[P("djames","David James",["GK"],[],82,"keeper"),P("kompany","Vincent Kompany ('08)",["CB"],[],82,"wall"),P("richardsm","Micah Richards",["RB"],[],79,"fullback"),P("dunne","Richard Dunne",["CB"],[],80,"wall"),P("ireland","Stephen Ireland",["CM","CAM"],[],79,"box2box"),P("elano","Elano",["CAM","RM"],[],80,"playmaker"),P("swp","Shaun Wright-Phillips",["RW"],[],80,"pace"),P("bellamy","Craig Bellamy",["ST"],["LW"],82,"pace"),P("robinho","Robinho ('08)",["LW","ST"],["RW"],84,"magician")]},
{club:"MCI",era:"10s",note:"First titles",players:[P("hart","Joe Hart",["GK"],[],84,"keeper"),P("kompany","Vincent Kompany ('14)",["CB"],[],86,"wall"),P("kolarov","Aleksandar Kolarov",["LB"],[],81,"fullback"),P("zabaleta","Pablo Zabaleta",["RB"],[],82,"fullback"),P("vieira","Patrick Vieira ('11)",["CM"],["CDM"],82,"engine"),P("milner","James Milner",["CM"],["RM"],81,"engine"),P("yaya","Yaya Touré ('14)",["CM","CDM"],[],86,"box2box"),P("davidsilva","David Silva",["CAM"],["CM"],87,"playmaker"),P("nasri","Samir Nasri",["CAM"],["LW"],83,"creator"),P("kdb","Kevin De Bruyne ('17)",["CAM","CM"],["RW"],88,"playmaker"),P("sterling","Raheem Sterling",["LW"],["RW"],83,"pace"),P("aguero","Sergio Agüero",["ST"],[],89,"poacher"),P("tevez","Carlos Tévez ('11)",["ST"],[],85,"power"),P("dzeko","Edin Džeko ('12)",["ST"],[],84,"power"),P("balotelli","Mario Balotelli",["ST"],[],82,"power"),P("adebayor","Emmanuel Adebayor ('10)",["ST"],[],82,"power")]},
{club:"MCI",era:"20s",note:"Treble machine",players:[P("ederson","Ederson",["GK"],[],88,"sweeperk"),P("dias","Rúben Dias",["CB"],[],88,"wall"),P("gvardiol","Joško Gvardiol",["CB","LB"],[],85,"ballplayer"),P("stones","John Stones",["CB"],["CDM"],84,"ballplayer"),P("khusanov","Abdukodir Khusanov",["CB"],[],80,"wall"),P("walker","Kyle Walker",["RB"],[],83,"fullback"),P("rodri","Rodri ('23)",["CDM","CM"],[],89,"anchor"),P("gundogan","İlkay Gündoğan",["CM","CAM"],[],85,"playmaker"),P("kdb","Kevin De Bruyne ('20)",["CAM","CM"],["RW"],91,"playmaker"),P("foden","Phil Foden",["CAM","LW"],["RW"],86,"creator"),P("bernardo","Bernardo Silva",["RW","CM"],["CAM"],86,"creator"),P("doku","Jérémy Doku",["LW"],["RW"],83,"pace"),P("cherki","Rayan Cherki",["CAM"],["RW"],83,"creator"),P("haaland","Erling Haaland ('23)",["ST"],[],91,"poacher")]},
/* LIVERPOOL */
{club:"LIV",era:"90s",note:"The Spice Boys",players:[P("djames","David James",["GK"],[],82,"keeper"),P("carragher","Jamie Carragher ('99)",["CB"],["RB"],80,"wall"),P("redknapp","Jamie Redknapp",["CM"],["CAM"],80,"playmaker"),P("mcmanaman","Steve McManaman",["RW","CAM"],[],84,"creator"),P("barnes","John Barnes",["LW","CAM"],[],82,"creator"),P("fowler","Robbie Fowler",["ST"],[],85,"poacher"),P("owen","Michael Owen ('98)",["ST"],[],84,"pace")]},
{club:"LIV",era:"00s",note:"The Istanbul boys",players:[P("dudek","Jerzy Dudek",["GK"],[],82,"keeper"),P("carragher","Jamie Carragher ('06)",["CB"],[],84,"wall"),P("hyypia","Sami Hyypiä",["CB"],[],83,"wall"),P("riise","John Arne Riise",["LB"],["LM"],81,"fullback"),P("gerrard","Steven Gerrard ('09)",["CM","CAM"],[],88,"box2box"),P("xabi","Xabi Alonso",["CM","CDM"],[],85,"playmaker"),P("masche","Javier Mascherano",["CDM"],["CB"],83,"anchor"),P("luisgarcia","Luis García",["CAM","LW"],[],82,"creator"),P("crouch","Peter Crouch",["ST"],[],80,"power"),P("cisse","Djibril Cissé",["ST"],[],82,"pace"),P("torres","Fernando Torres ('08)",["ST"],[],87,"pace")]},
{club:"LIV",era:"10s",note:"Suárez → Klopp",players:[P("alisson","Alisson",["GK"],[],89,"sweeperk"),P("vvd","Virgil van Dijk",["CB"],[],90,"wall"),P("matip","Joël Matip",["CB"],[],82,"ballplayer"),P("robbo","Andrew Robertson",["LB"],[],86,"fullback"),P("taa","Trent Alexander-Arnold",["RB"],[],88,"fullback"),P("wijnaldum","Georginio Wijnaldum",["CM"],["CDM"],83,"box2box"),P("coutinho","Philippe Coutinho",["CAM"],["LW"],85,"magician"),P("suarez","Luis Suárez ('14)",["ST"],[],89,"complete"),P("salah","Mohamed Salah ('18)",["RW","ST"],[],90,"pace",true),P("gakpo","Cody Gakpo",["LW"],["ST"],83,"pace"),P("mane","Sadio Mané",["LW","ST"],[],87,"pace"),P("firmino","Roberto Firmino",["ST","CAM"],[],85,"complete")]},
{club:"LIV",era:"20s",note:"Champions, then Slot",players:[P("alisson","Alisson ('22)",["GK"],[],89,"sweeperk"),P("vvd","Virgil van Dijk ('22)",["CB"],[],90,"wall"),P("konate","Ibrahima Konaté",["CB"],[],85,"wall"),P("taa","Trent Alexander-Arnold ('22)",["RB"],[],87,"fullback"),P("robbo","Andrew Robertson",["LB"],[],84,"fullback"),P("frimpong","Jeremie Frimpong ('25)",["RB","RWB"],[],83,"fullback"),P("macallister","Alexis Mac Allister",["CM"],["CDM"],84,"playmaker"),P("szoboszlai","Dominik Szoboszlai",["CM","CAM"],[],83,"box2box"),P("wirtz","Florian Wirtz ('25)",["CAM"],["LW"],87,"magician"),P("salah","Mohamed Salah ('22)",["RW"],["ST"],90,"pace"),P("diaz","Luis Díaz",["LW"],[],85,"pace"),P("jota","Diogo Jota",["ST","LW"],[],83,"poacher"),P("isak","Alexander Isak",["ST"],[],84,"complete"),P("ekitike","Hugo Ekitike",["ST"],[],82,"pace")]},
/* CHELSEA */
{club:"CHE",era:"90s",note:"Zola & the Italians",players:[P("degoey","Ed de Goey",["GK"],[],78,"keeper"),P("leboeuf","Frank Leboeuf",["CB"],[],81,"ballplayer"),P("desailly","Marcel Desailly ('98)",["CB","CDM"],[],84,"wall"),P("petrescu","Dan Petrescu",["RB"],[],80,"fullback"),P("wise","Dennis Wise",["CM"],["CDM"],80,"engine"),P("dimatteo","Roberto Di Matteo",["CM"],["CDM"],79,"box2box"),P("zola","Gianfranco Zola",["CF","CAM"],[],86,"magician"),P("vialli","Gianluca Vialli",["ST"],[],82,"poacher")]},
{club:"CHE",era:"00s",note:"Mourinho's wall",players:[P("cech","Petr Čech ('07)",["GK"],[],89,"keeper"),P("terry","John Terry",["CB"],[],88,"wall"),P("carvalho","Ricardo Carvalho",["CB"],[],84,"wall"),P("ashleycole","Ashley Cole ('09)",["LB"],[],86,"fullback"),P("makelele","Claude Makélélé",["CDM"],[],85,"anchor"),P("lampard","Frank Lampard ('10)",["CM"],["CAM"],87,"box2box"),P("essien","Michael Essien",["CM","CDM"],[],85,"engine"),P("ballack","Michael Ballack",["CM","CAM"],[],85,"box2box"),P("robben","Arjen Robben",["RW"],["LW"],84,"winger"),P("drogba","Didier Drogba ('07)",["ST"],[],88,"power"),P("anelka","Nicolas Anelka ('09)",["ST"],[],84,"complete")]},
{club:"CHE",era:"10s",note:"Hazard's masterclass",players:[P("courtois","Thibaut Courtois",["GK"],[],89,"keeper"),P("cech","Petr Čech ('12)",["GK"],[],88,"keeper"),P("terry","John Terry ('13)",["CB"],[],85,"wall"),P("davidluiz","David Luiz",["CB","CDM"],[],83,"ballplayer"),P("azpi","César Azpilicueta",["RB"],["LB","CB"],83,"fullback"),P("matic","Nemanja Matić",["CDM"],["CM"],84,"anchor"),P("kante","N'Golo Kanté ('17)",["CDM","CM"],[],88,"anchor"),P("fabregas","Cesc Fàbregas ('15)",["CAM","CM"],[],86,"playmaker"),P("oscar","Oscar",["CAM"],["CM"],82,"playmaker"),P("willian","Willian",["RW","LW"],[],82,"creator"),P("hazard","Eden Hazard ('17)",["LW","CAM"],["RW"],90,"magician"),P("pedro","Pedro",["RW"],["LW"],81,"pace"),P("torres","Fernando Torres ('12)",["ST"],[],83,"pace"),P("costa_d","Diego Costa",["ST"],[],84,"power")]},
{club:"CHE",era:"20s",note:"The new project",players:[P("cmendy","Édouard Mendy",["GK"],[],83,"keeper"),P("thiagosilva","Thiago Silva",["CB"],[],84,"ballplayer"),P("colwill","Levi Colwill",["CB","LB"],[],82,"ballplayer"),P("reecejames","Reece James",["RB"],["RWB"],82,"fullback"),P("caicedo","Moisés Caicedo",["CDM"],["CM"],84,"anchor"),P("enzo","Enzo Fernández",["CM"],["CDM"],83,"playmaker"),P("palmer","Cole Palmer ('24)",["CAM"],["RW"],85,"playmaker"),P("pneto","Pedro Neto",["RW","LW"],[],82,"winger"),P("mudryk","Mykhailo Mudryk",["LW"],["RW"],76,"pace"),P("havertz","Kai Havertz ('22)",["ST","CAM"],[],82,"complete"),P("werner","Timo Werner ('21)",["ST"],["LW"],79,"pace"),P("aubameyang","Aubameyang ('22)",["ST"],[],81,"pace"),P("lukaku","Romelu Lukaku ('21)",["ST"],[],84,"power"),P("joaopedro","João Pedro",["ST","CAM"],[],82,"complete")]},
/* TOTTENHAM */
{club:"TOT",era:"90s",note:"Klinsmann & Ginola",players:[P("ianwalker","Ian Walker",["GK"],[],79,"keeper"),P("solcampbell","Sol Campbell",["CB"],[],84,"wall"),P("anderton","Darren Anderton",["RM","CM"],[],80,"winger"),P("waddle","Chris Waddle",["LW","CAM"],[],82,"magician"),P("ginola","David Ginola",["LW"],[],84,"magician"),P("sheringham","Teddy Sheringham",["ST","CF"],[],84,"creator"),P("klinsmann","Jürgen Klinsmann",["ST"],[],86,"poacher")]},
{club:"TOT",era:"00s",note:"Berbatov & mid-table",players:[P("probinson","Paul Robinson",["GK"],[],82,"keeper"),P("king","Ledley King",["CB"],[],83,"ballplayer"),P("dawson","Michael Dawson",["CB"],[],79,"wall"),P("carrick","Michael Carrick ('05)",["CM"],["CDM"],80,"playmaker"),P("modric","Luka Modrić ('09)",["CM","CAM"],[],83,"playmaker"),P("lennon","Aaron Lennon",["RW"],[],79,"pace"),P("berbatov","Dimitar Berbatov",["ST","CF"],[],85,"creator"),P("robbiekeane","Robbie Keane",["ST"],[],82,"poacher"),P("defoe","Jermain Defoe",["ST"],[],81,"poacher")]},
{club:"TOT",era:"10s",note:"Pochettino's surge",players:[P("lloris","Hugo Lloris",["GK"],[],85,"sweeperk"),P("alderweireld","Toby Alderweireld",["CB"],[],84,"ballplayer"),P("vertonghen","Jan Vertonghen",["CB"],["LB"],84,"wall"),P("walker","Kyle Walker ('17)",["RB"],[],83,"fullback"),P("trippier","Kieran Trippier ('18)",["RB"],[],82,"fullback"),P("rose","Danny Rose",["LB"],[],80,"fullback"),P("moussadembele","Mousa Dembélé",["CM"],["CDM"],82,"engine"),P("eriksen","Christian Eriksen",["CAM"],["CM"],84,"playmaker"),P("alli","Dele Alli",["CAM"],["CM"],82,"box2box"),P("son","Son Heung-min ('19)",["LW","ST"],["RW"],86,"complete"),P("kane","Harry Kane ('18)",["ST"],[],88,"complete"),P("bale","Gareth Bale ('13)",["RW"],["LW"],89,"complete")]},
  {club:"TOT",era:"20s",note:"Son & Kane, then Ange",players:[P("vicario","Guglielmo Vicario",["GK"],[],83,"sweeperk"),P("romero","Cristian Romero",["CB"],[],84,"wall"),P("vandeven","Micky van de Ven",["CB"],[],82,"sweeper"),P("porro","Pedro Porro",["RB","RWB"],[],81,"fullback"),P("udogie","Destiny Udogie",["LB","LWB"],[],80,"fullback"),P("bissouma","Yves Bissouma",["CDM"],["CM"],81,"anchor"),P("maddison","James Maddison",["CAM"],[],84,"playmaker"),P("xavisimons","Xavi Simons",["CAM"],["LW"],84,"creator"),P("son","Son Heung-min ('22)",["LW","ST"],[],86,"complete"),P("kulusevski","Dejan Kulusevski",["RW"],["CM"],81,"winger"),P("kane","Harry Kane ('22)",["ST"],[],90,"complete",true),P("solanke","Dominic Solanke",["ST"],[],81,"power"),P("kolomuani","Randal Kolo Muani",["ST"],[],82,"complete")]},
/* MARSEILLE */
{club:"OM",era:"90s",note:"Kings of Europe '93",players:[P("barthez","Fabien Barthez",["GK"],[],84,"keeper"),P("desailly","Marcel Desailly",["CB","CDM"],[],84,"wall"),P("boli","Basile Boli",["CB"],[],82,"wall"),P("deschamps","Didier Deschamps",["CDM","CM"],[],82,"anchor"),P("waddle","Chris Waddle ('92)",["LW","CAM"],[],83,"magician"),P("abedipele","Abedi Pelé",["CAM","LW"],[],85,"magician"),P("papin","Jean-Pierre Papin",["ST"],[],86,"poacher"),P("voller","Rudi Völler",["ST"],[],84,"poacher")]},
{club:"OM",era:"00s",note:"UEFA Cup nights",players:[P("mandanda","Steve Mandanda",["GK"],[],82,"keeper"),P("cana","Lorik Cana",["CDM"],["CB"],80,"anchor"),P("nasri","Samir Nasri ('07)",["CAM"],["LW"],83,"creator"),P("ribery","Franck Ribéry",["LW","RW"],[],84,"winger"),P("drogba","Didier Drogba ('04)",["ST"],[],85,"power"),P("niang","Mamadou Niang",["ST"],[],80,"poacher")]},
{club:"OM",era:"10s",note:"2010 champions",players:[P("mandanda","Steve Mandanda ('10)",["GK"],[],84,"keeper"),P("nkoulou","Nicolas Nkoulou",["CB"],[],82,"wall"),P("valbuena","Mathieu Valbuena",["CAM","RW"],[],83,"creator"),P("payet","Dimitri Payet",["CAM"],["LW"],84,"creator"),P("ayew","André Ayew",["LW","ST"],[],82,"pace"),P("gignac","André-Pierre Gignac",["ST"],[],83,"power"),P("remy","Loïc Rémy",["ST"],["RW"],82,"pace")]},
{club:"OM",era:"20s",note:"De Zerbi's project",players:[P("paulopez","Pau López",["GK"],[],82,"keeper"),P("balerdi","Leonardo Balerdi",["CB"],[],80,"wall"),P("clauss","Jonathan Clauss",["RWB","RB"],[],81,"fullback"),P("guendouzi","Mattéo Guendouzi",["CM"],["CDM"],82,"box2box"),P("veretout","Jordan Veretout",["CM"],["CDM"],81,"box2box"),P("sanchez","Alexis Sánchez ('23)",["ST","CAM"],[],84,"complete"),P("aubameyang","Aubameyang ('23)",["ST"],["LW"],82,"pace")]},
/* LYON */
{club:"OL",era:"90s",note:"Before the dynasty",players:[P("coupet","Grégory Coupet",["GK"],[],83,"keeper"),P("brechet","Patrick Bréchet",["CB"],[],78,"wall"),P("giuly","Ludovic Giuly",["RW"],["CAM"],80,"winger"),P("maurice","Florian Maurice",["ST"],[],79,"poacher")]},
{club:"OL",era:"00s",note:"Seven in a row",players:[P("coupet","Grégory Coupet ('06)",["GK"],[],85,"keeper"),P("cris","Cris",["CB"],[],85,"wall"),P("abidal","Eric Abidal",["LB"],["CB"],83,"fullback"),P("mdiarra","Mahamadou Diarra",["CDM"],["CM"],82,"anchor"),P("essien","Michael Essien",["CM","CDM"],[],85,"engine"),P("juninho","Juninho",["CM","CAM"],[],86,"magician"),P("gourcuff","Yoann Gourcuff",["CAM"],["CM"],82,"playmaker"),P("benarfa","Hatem Ben Arfa",["RW","CAM"],[],82,"magician"),P("malouda","Florent Malouda",["LW"],["CAM"],82,"winger"),P("benzema","Karim Benzema ('08)",["ST","CF"],[],85,"complete"),P("lisandrolopez","Lisandro López",["ST"],[],84,"poacher")]},
{club:"OL",era:"10s",note:"Fekir & Lacazette",players:[P("lopes","Anthony Lopes",["GK"],[],82,"keeper"),P("umtiti","Samuel Umtiti",["CB"],[],82,"ballplayer"),P("tolisso","Corentin Tolisso",["CM"],["CDM"],81,"box2box"),P("fekir","Nabil Fekir",["CAM"],["ST"],84,"creator"),P("lisandrolopez","Lisandro López ('12)",["ST"],[],83,"poacher"),P("lacazette","Alexandre Lacazette ('17)",["ST"],[],84,"poacher"),P("gomis","Bafétimbi Gomis",["ST"],[],81,"power")]},
{club:"OL",era:"20s",note:"Cherki's flair",players:[P("lopes","Anthony Lopes ('22)",["GK"],[],82,"keeper"),P("lukeba","Castello Lukeba",["CB"],[],80,"sweeper"),P("tagliafico","Nicolás Tagliafico",["LB"],[],81,"fullback"),P("caqueret","Maxence Caqueret",["CM"],["CDM"],80,"engine"),P("cherki","Rayan Cherki ('24)",["CAM"],["RW"],82,"creator"),P("lacazette","Alexandre Lacazette ('23)",["ST"],[],83,"poacher"),P("moussadembele_st","Moussa Dembélé",["ST"],[],82,"poacher")]},
/* MONACO */
{club:"ASM",era:"90s",note:"'97 champions",players:[P("barthez","Fabien Barthez ('97)",["GK"],[],84,"keeper"),P("dumas","Franck Dumas",["CB"],[],80,"wall"),P("petit","Emmanuel Petit",["CDM","CM"],[],82,"anchor"),P("djorkaeff","Youri Djorkaeff",["CAM"],["ST"],84,"creator"),P("henry","Thierry Henry ('98)",["ST","LW"],[],81,"pace"),P("trezeguet","David Trezeguet ('98)",["ST"],[],82,"poacher")]},
{club:"ASM",era:"00s",note:"2004 UCL final",players:[P("roma","Flavio Roma",["GK"],[],82,"keeper"),P("squillaci","Sébastien Squillaci",["CB"],[],80,"wall"),P("evra","Patrice Evra ('05)",["LB"],[],82,"fullback"),P("giuly","Ludovic Giuly ('04)",["RW"],["CAM"],83,"pace"),P("rothen","Jérôme Rothen",["LW"],["LM"],81,"winger"),P("morientes","Fernando Morientes ('04)",["ST"],[],85,"poacher")]},
{club:"ASM",era:"10s",note:"Mbappé's explosion",players:[P("subasic","Danijel Subašić",["GK"],[],82,"keeper"),P("carvalho","Ricardo Carvalho ('14)",["CB"],[],82,"wall"),P("glik","Kamil Glik",["CB"],[],85,"wall"),P("kurzawa","Layvin Kurzawa",["LB"],[],80,"fullback"),P("toulalan","Jérémy Toulalan",["CDM"],["CB"],81,"anchor"),P("fabinho","Fabinho ('17)",["CDM","RB"],[],84,"anchor"),P("moutinho","João Moutinho",["CM"],["CDM"],83,"playmaker"),P("james","James Rodríguez",["CAM"],["LW"],84,"creator"),P("bernardo","Bernardo Silva ('16)",["CAM","RW"],[],86,"creator"),P("lemar","Thomas Lemar",["LW"],["CAM"],82,"winger"),P("carrasco","Yannick Carrasco",["LW"],["RW"],82,"winger"),P("falcao","Radamel Falcao",["ST"],[],87,"poacher"),P("martial","Anthony Martial",["ST"],["LW"],81,"pace"),P("mbappe","Kylian Mbappé ('17)",["ST","LW"],[],88,"pace")]},
{club:"ASM",era:"20s",note:"Golovin & goals",players:[P("nubel","Alexander Nübel",["GK"],[],82,"keeper"),P("maripan","Guillermo Maripán",["CB"],[],80,"wall"),P("fofana","Youssouf Fofana",["CM","CDM"],[],81,"anchor"),P("golovin","Aleksandr Golovin",["CAM"],["LW"],82,"creator"),P("minamino","Takumi Minamino",["CAM","LW"],[],81,"creator"),P("benyedder","Wissam Ben Yedder",["ST"],[],84,"poacher"),P("embolo","Breel Embolo",["ST"],[],80,"power")]},
/* LILLE */
{club:"LIL",era:"90s",note:"Lower-table years",players:[P("wimbee","Régis Wimbée",["GK"],[],76,"keeper"),P("cygan","Pascal Cygan",["CB"],[],77,"wall"),P("landrin","Christophe Landrin",["CM"],["CAM"],76,"engine"),P("boutoille","Pascal Boutoille",["ST"],[],77,"poacher")]},
{club:"LIL",era:"00s",note:"Makoun's midfield",players:[P("sylva","Tony Sylva",["GK"],[],81,"keeper"),P("tafforeau","Grégory Tafforeau",["LB"],["CB"],78,"fullback"),P("makoun","Jean Makoun",["CM"],["CDM"],81,"box2box"),P("bastos","Michel Bastos",["LB","LW"],[],81,"fullback"),P("odemwingie","Peter Odemwingie",["ST"],["RW"],81,"pace"),P("moussilou","Matt Moussilou",["ST"],[],79,"poacher")]},
{club:"LIL",era:"10s",note:"2011 double",players:[P("landreau","Mickaël Landreau",["GK"],[],82,"keeper"),P("rami","Adil Rami",["CB"],[],81,"wall"),P("mavuba","Rio Mavuba",["CDM"],["CM"],80,"anchor"),P("cabaye","Yohan Cabaye",["CM"],["CDM"],83,"playmaker"),P("cabella","Rémy Cabella",["CAM"],["RW"],81,"creator"),P("hazard","Eden Hazard ('11)",["LW"],["CAM"],85,"magician"),P("pepe","Nicolas Pépé",["RW"],["LW"],82,"winger"),P("sow","Moussa Sow",["ST"],[],82,"poacher")]},
{club:"LIL",era:"20s",note:"2021 champions",players:[P("maignan","Mike Maignan",["GK"],[],85,"keeper"),P("botman","Sven Botman",["CB"],[],82,"wall"),P("fonte","José Fonte",["CB"],[],81,"wall"),P("soumare","Boubakary Soumaré",["CDM","CM"],[],81,"anchor"),P("renatosanches","Renato Sanches",["CM"],["CAM"],82,"box2box"),P("yazici","Yusuf Yazıcı",["CAM"],["RW"],80,"playmaker"),P("david","Jonathan David",["ST"],[],82,"poacher"),P("yilmaz","Burak Yılmaz",["ST"],[],82,"power")]},
/* PSG */
{club:"PSG",era:"90s",note:"Weah, Raí & Ginola",players:[P("lama","Bernard Lama",["GK"],[],82,"keeper"),P("kombouare","Antoine Kombouaré",["CB"],[],78,"wall"),P("rai","Raí",["CAM"],[],84,"creator"),P("ginola","David Ginola ('94)",["LW"],[],84,"magician"),P("weah","George Weah",["ST"],[],86,"complete")]},
{club:"PSG",era:"00s",note:"Ronaldinho's debut",players:[P("letizi","Lionel Letizi",["GK"],[],79,"keeper"),P("pochettino","Mauricio Pochettino",["CB"],[],80,"wall"),P("ronaldinho","Ronaldinho ('03)",["CAM","LW"],[],86,"magician"),P("rothen","Jérôme Rothen ('06)",["LW"],[],81,"winger"),P("pauleta","Pauleta",["ST"],[],84,"poacher")]},
{club:"PSG",era:"10s",note:"QSI billions",players:[P("sirigu","Salvatore Sirigu",["GK"],[],83,"keeper"),P("thiagosilva","Thiago Silva ('14)",["CB"],[],85,"ballplayer"),P("marquinhos","Marquinhos",["CB"],["CDM"],84,"sweeper"),P("maxwell","Maxwell",["LB"],[],80,"fullback"),P("motta","Thiago Motta",["CDM"],["CM"],82,"anchor"),P("verratti","Marco Verratti",["CM","CDM"],[],85,"playmaker"),P("pastore","Javier Pastore",["CAM"],["LW"],83,"creator"),P("dimaria","Ángel Di María ('18)",["RW","LW"],["CAM"],84,"winger"),P("zlatan","Zlatan Ibrahimović ('13)",["ST"],[],87,"power"),P("cavani","Edinson Cavani",["ST"],[],86,"poacher"),P("neymar","Neymar ('18)",["LW"],["CAM"],88,"magician"),P("mbappe","Kylian Mbappé ('18)",["ST","LW"],[],89,"pace")]},
{club:"PSG",era:"20s",note:"Luis Enrique's UCL",players:[P("donnarumma","Gianluigi Donnarumma",["GK"],[],87,"keeper"),P("marquinhos","Marquinhos ('22)",["CB"],["CDM"],85,"sweeper"),P("pacho","Willian Pacho",["CB"],[],83,"wall"),P("hakimi","Achraf Hakimi",["RB","RWB"],[],88,"fullback"),P("nunomendes","Nuno Mendes",["LB","LWB"],[],87,"fullback"),P("sergioramos","Sergio Ramos ('22)",["CB"],[],84,"wall"),P("fabianruiz","Fabian Ruiz",["CM"],[],84,"box2box"),P("joaoneves","João Neves",["CM"],["CDM"],84,"box2box"),P("vitinha","Vitinha",["CM"],["CDM"],88,"playmaker"),P("doue","Désiré Doué",["CAM","RW"],[],83,"creator"),P("kvara","Khvicha Kvaratskhelia ('25)",["LW"],[],90,"magician",true),P("barcola","Bradley Barcola",["LW","RW"],[],83,"pace"),P("ousdembele","Ousmane Dembélé",["RW","ST"],["LW"],90,"pace",true),P("messi","Lionel Messi ('22)",["RW","CF"],["CAM"],89,"magician"),P("gramos","Gonçalo Ramos",["ST"],[],82,"poacher"),P("mbappe","Kylian Mbappé ('23)",["ST","LW"],[],90,"pace")]},
/* BAYERN */
{club:"BAY",era:"90s",note:"Kahn & Matthäus",players:[P("kahn","Oliver Kahn",["GK"],[],87,"keeper"),P("matthaus","Lothar Matthäus",["CDM","CB"],[],86,"anchor"),P("effenberg","Stefan Effenberg",["CM"],["CDM"],84,"box2box"),P("scholl","Mehmet Scholl",["CAM"],["RW"],83,"creator"),P("elber","Giovane Élber",["ST"],[],84,"poacher")]},
{club:"BAY",era:"00s",note:"Ballack & Makaay",players:[P("kahn","Oliver Kahn ('05)",["GK"],[],88,"keeper"),P("lucio","Lúcio",["CB"],[],85,"wall"),P("lahm","Philipp Lahm ('08)",["RB","LB"],[],84,"fullback"),P("ballack","Michael Ballack ('05)",["CM","CAM"],[],85,"box2box"),P("zeroberto","Zé Roberto",["CM","LM"],[],83,"box2box"),P("schweinsteiger","Bastian Schweinsteiger ('08)",["CM"],["CDM"],80,"engine"),P("karimi","Ali Karimi",["CAM"],["LW"],78,"magician"),P("makaay","Roy Makaay",["ST"],[],84,"poacher"),P("toni","Luca Toni ('08)",["ST"],[],84,"power")]},
{club:"BAY",era:"10s",note:"2013 treble",players:[P("neuer","Manuel Neuer",["GK"],[],90,"sweeperk"),P("boateng","Jérôme Boateng",["CB"],[],86,"wall"),P("javimartinez","Javi Martínez",["CDM","CB"],[],84,"anchor"),P("alaba","David Alaba ('14)",["LB","CB"],[],84,"ballplayer"),P("lahm","Philipp Lahm",["RB"],["CDM"],84,"fullback"),P("schweinsteiger","Bastian Schweinsteiger ('13)",["CM"],["CDM"],85,"engine"),P("thiago","Thiago Alcântara ('15)",["CM"],["CDM"],85,"playmaker"),P("robben","Arjen Robben",["RW"],[],84,"winger"),P("ribery","Franck Ribéry ('13)",["LW"],[],85,"winger"),P("muller","Thomas Müller",["CF","RW"],["ST"],85,"poacher"),P("mariogomez","Mario Gómez ('11)",["ST"],[],83,"poacher"),P("mandzukic","Mario Mandžukić",["ST"],[],83,"power"),P("lewa","Robert Lewandowski ('16)",["ST"],[],88,"poacher")]},
  {club:"BAY",era:"20s",note:"Kane & Musiala",players:[P("neuer","Manuel Neuer ('20)",["GK"],[],88,"sweeperk"),P("upamecano","Dayot Upamecano",["CB"],[],83,"wall"),P("kimmich","Joshua Kimmich",["CDM","RB"],[],87,"anchor"),P("davies","Alphonso Davies",["LB"],[],84,"fullback"),P("musiala","Jamal Musiala",["CAM"],["LW"],86,"creator"),P("muller","Thomas Müller ('20)",["CF"],["RW"],84,"poacher"),P("coman","Kingsley Coman",["LW"],["RW"],84,"pace"),P("olise","Michael Olise",["RW"],["CAM"],88,"creator"),P("luisdiaz","Luis Díaz ('25)",["LW"],[],85,"pace"),P("sane","Leroy Sané",["LW"],["RW"],82,"pace"),P("lewa","Robert Lewandowski ('21)",["ST"],[],90,"poacher",true),P("kane","Harry Kane ('24)",["ST"],[],90,"complete",true)]},
/* LEVERKUSEN */
{club:"B04",era:"90s",note:"Kirsten's goals",players:[P("vollborn","Rüdiger Vollborn",["GK"],[],78,"keeper"),P("worns","Christian Wörns",["CB"],[],82,"wall"),P("ramelow","Carsten Ramelow",["CDM"],["CM"],80,"anchor"),P("emerson_b","Emerson",["CM"],[],82,"engine"),P("kirsten","Ulf Kirsten",["ST"],[],83,"poacher")]},
{club:"B04",era:"00s",note:"2002 finalists",players:[P("butt","Hans-Jörg Butt",["GK"],[],83,"keeper"),P("lucio","Lúcio ('02)",["CB"],[],84,"wall"),P("placente","Diego Placente",["LB"],[],80,"fullback"),P("ballack","Michael Ballack ('02)",["CM","CAM"],[],84,"box2box"),P("zeroberto","Zé Roberto ('02)",["CM","LM"],[],83,"box2box"),P("schneider","Bernd Schneider",["CAM","RM"],[],82,"winger"),P("berbatov","Dimitar Berbatov ('04)",["ST"],[],83,"creator"),P("neuville","Oliver Neuville",["ST"],[],81,"poacher")]},
{club:"B04",era:"10s",note:"Çalhanoğlu & Son",players:[P("leno","Bernd Leno",["GK"],[],84,"keeper"),P("tah","Jonathan Tah ('17)",["CB"],[],82,"wall"),P("bender","Lars Bender",["CDM","CM"],[],81,"anchor"),P("calhanoglu","Hakan Çalhanoğlu",["CAM"],["CM"],83,"playmaker"),P("brandt","Julian Brandt",["LW","CAM"],[],82,"creator"),P("son","Son Heung-min ('14)",["LW","ST"],[],82,"pace"),P("kiessling","Stefan Kießling",["ST"],[],82,"poacher")]},
{club:"B04",era:"20s",note:"Xabi's invincibles",players:[P("hradecky","Lukáš Hrádecký",["GK"],[],84,"keeper"),P("tah","Jonathan Tah ('24)",["CB"],[],85,"wall"),P("tapsoba","Edmond Tapsoba",["CB"],[],84,"sweeper"),P("frimpong","Jeremie Frimpong",["RWB","RW"],[],84,"fullback"),P("grimaldo","Álex Grimaldo",["LWB","LB"],[],83,"fullback"),P("palacios","Exequiel Palacios",["CM"],["CDM"],82,"box2box"),P("xhaka","Granit Xhaka",["CM","CDM"],[],86,"playmaker"),P("hofmann","Jonas Hofmann",["RW"],["RM"],80,"winger"),P("wirtz","Florian Wirtz ('24)",["CAM"],["LW"],88,"magician"),P("boniface","Victor Boniface",["ST"],[],83,"power")]},
/* DORTMUND */
{club:"BVB",era:"90s",note:"1997 UCL winners",players:[P("klos","Stefan Klos",["GK"],[],82,"keeper"),P("kohler","Jürgen Kohler",["CB"],[],83,"wall"),P("sammer","Matthias Sammer",["CB","CDM"],[],86,"sweeper"),P("moller","Andreas Möller",["CAM"],["CM"],84,"creator"),P("chapuisat","Stéphane Chapuisat",["LW","ST"],[],82,"pace"),P("riedle","Karl-Heinz Riedle",["ST"],[],82,"poacher")]},
{club:"BVB",era:"00s",note:"2002 champions",players:[P("lehmann","Jens Lehmann ('02)",["GK"],[],83,"keeper"),P("metzelder","Christoph Metzelder",["CB"],[],81,"wall"),P("rosicky","Tomáš Rosický",["CAM"],["CM"],83,"creator"),P("koller","Jan Koller",["ST"],[],82,"power"),P("amoroso","Márcio Amoroso",["ST"],[],82,"poacher")]},
{club:"BVB",era:"10s",note:"Klopp's young guns",players:[P("weidenfeller","Roman Weidenfeller",["GK"],[],83,"keeper"),P("hummels","Mats Hummels",["CB"],[],87,"ballplayer"),P("subotic","Neven Subotić",["CB"],[],82,"wall"),P("schmelzer","Marcel Schmelzer",["LB"],[],80,"fullback"),P("piszczek","Łukasz Piszczek",["RB"],[],81,"fullback"),P("svenbender","Sven Bender",["CDM"],["CM"],81,"anchor"),P("sahin","Nuri Şahin",["CM"],["CDM"],82,"playmaker"),P("gundogan","İlkay Gündoğan ('15)",["CM"],["CAM"],85,"playmaker"),P("kuba","Jakub Błaszczykowski",["RM","RW"],[],81,"winger"),P("gotze","Mario Götze",["CAM"],["ST"],83,"creator"),P("ousdembele","Ousmane Dembélé",["RW"],["LW"],83,"pace"),P("reus","Marco Reus",["CAM","LW"],["ST"],86,"creator"),P("lewa","Robert Lewandowski ('13)",["ST"],[],86,"poacher"),P("aubameyang","Aubameyang ('16)",["ST"],["LW"],85,"pace"),P("sancho","Jadon Sancho",["RW"],["LW"],83,"winger")]},
  {club:"BVB",era:"20s",note:"Bellingham & Haaland",players:[P("kobel","Gregor Kobel",["GK"],[],84,"keeper"),P("schlotterbeck","Nico Schlotterbeck",["CB"],[],82,"ballplayer"),P("ryerson","Julian Ryerson",["RB","LB"],[],80,"fullback"),P("bellingham","Jude Bellingham ('22)",["CM","CAM"],[],85,"box2box"),P("brandt","Julian Brandt ('23)",["CAM"],["CM"],83,"playmaker"),P("reus","Marco Reus ('22)",["CAM","LW"],[],84,"creator"),P("sancho","Jadon Sancho ('24)",["RW"],["LW"],82,"winger"),P("adeyemi","Karim Adeyemi",["LW"],["RW"],79,"pace"),P("haaland","Erling Haaland ('21)",["ST"],[],88,"poacher")]},
/* WOLFSBURG */
{club:"WOB",era:"90s",note:"Newly promoted",players:[P("koch","Koch",["GK"],[],74,"keeper"),P("rische","Rische",["CB"],[],73,"wall"),P("wagner","Wagner",["CM"],[],74,"engine"),P("akpoborie","Jonathan Akpoborie",["ST"],[],78,"poacher")]},
{club:"WOB",era:"00s",note:"2009 champions",players:[P("benaglio","Diego Benaglio",["GK"],[],82,"keeper"),P("barzagli","Andrea Barzagli",["CB"],[],84,"wall"),P("josue","Josué",["CDM","CM"],[],80,"anchor"),P("misimovic","Zvjezdan Misimović",["CAM"],[],84,"playmaker"),P("grafite","Grafite",["ST"],[],85,"poacher"),P("dzeko","Edin Džeko ('09)",["ST"],[],85,"power")]},
{club:"WOB",era:"10s",note:"2015 cup run",players:[P("benaglio","Diego Benaglio ('15)",["GK"],[],82,"keeper"),P("naldo","Naldo",["CB"],[],83,"wall"),P("rrodriguez","Ricardo Rodríguez",["LB"],[],82,"fullback"),P("gustavo","Luiz Gustavo",["CDM"],["CM"],83,"anchor"),P("kdb","Kevin De Bruyne ('14)",["CAM","CM"],["RW"],85,"playmaker"),P("draxler","Julian Draxler",["CAM","LW"],[],84,"creator"),P("mandzukic","Mario Mandžukić ('15)",["ST"],[],83,"power"),P("dost","Bas Dost",["ST"],[],82,"poacher")]},
{club:"WOB",era:"20s",note:"Mid-table grind",players:[P("casteels","Koen Casteels",["GK"],[],83,"keeper"),P("lacroix","Maxence Lacroix",["CB"],[],81,"wall"),P("baku","Ridle Baku",["RB","RWB"],[],80,"fullback"),P("arnold","Maximilian Arnold",["CM"],["CDM"],81,"box2box"),P("weghorst","Wout Weghorst",["ST"],[],82,"power"),P("wind","Jonas Wind",["ST"],[],80,"poacher")]},
/* SCHALKE */
{club:"S04",era:"90s",note:"UEFA Cup '97",players:[P("lehmann","Jens Lehmann ('97)",["GK"],[],82,"keeper"),P("linke","Thomas Linke",["CB"],[],80,"wall"),P("thon","Olaf Thon",["CM","CB"],[],82,"box2box"),P("mulder","Youri Mulder",["CAM","ST"],[],80,"playmaker"),P("wilmots","Marc Wilmots",["ST"],[],82,"power")]},
{club:"S04",era:"00s",note:"Kuranyi up top",players:[P("rost","Frank Rost",["GK"],[],82,"keeper"),P("bordon","Marcelo Bordon",["CB"],[],81,"wall"),P("altintop","Hamit Altıntop",["CM"],["RM"],81,"box2box"),P("kuranyi","Kevin Kuranyi",["ST"],[],83,"poacher"),P("ailton","Ailton",["ST"],[],82,"poacher")]},
{club:"S04",era:"10s",note:"Neuer & Raúl",players:[P("neuer","Manuel Neuer ('10)",["GK"],[],84,"sweeperk"),P("howedes","Benedikt Höwedes",["CB"],[],82,"wall"),P("matip","Joël Matip ('14)",["CB"],[],81,"ballplayer"),P("goretzka","Leon Goretzka ('16)",["CM"],["CDM"],82,"box2box"),P("draxler","Julian Draxler ('14)",["CAM","LW"],[],82,"creator"),P("farfan","Jefferson Farfán",["RW"],[],80,"pace"),P("raul","Raúl ('11)",["ST"],[],83,"poacher"),P("huntelaar","Klaas-Jan Huntelaar",["ST"],[],85,"poacher")]},
{club:"S04",era:"20s",note:"Relegation blues",players:[P("fahrmann","Ralf Fährmann",["GK"],[],80,"keeper"),P("kabak","Ozan Kabak",["CB"],[],79,"wall"),P("bentaleb","Nabil Bentaleb",["CM"],["CDM"],79,"box2box"),P("harit","Amine Harit",["CAM"],["LW"],80,"creator"),P("terodde","Simon Terodde",["ST"],[],79,"poacher")]},
/* RB LEIPZIG */
{club:"RBL",era:"10s",note:"The meteoric rise",players:[P("gulacsi","Péter Gulácsi",["GK"],[],84,"keeper"),P("upamecano","Dayot Upamecano ('19)",["CB"],[],82,"wall"),P("konate","Ibrahima Konaté ('20)",["CB"],[],81,"wall"),P("orban","Willi Orbán",["CB"],[],81,"wall"),P("sabitzer","Marcel Sabitzer",["CM"],["CAM"],82,"box2box"),P("forsberg","Emil Forsberg",["CAM"],["LW"],83,"playmaker"),P("werner","Timo Werner",["ST"],[],84,"pace")]},
{club:"RBL",era:"20s",note:"Nkunku's flair",players:[P("gulacsi","Péter Gulácsi ('22)",["GK"],[],84,"keeper"),P("gvardiol","Joško Gvardiol ('22)",["CB"],[],84,"ballplayer"),P("laimer","Konrad Laimer",["CM","CDM"],[],81,"engine"),P("szoboszlai","Dominik Szoboszlai ('22)",["CM","CAM"],[],83,"box2box"),P("xavisimons","Xavi Simons ('23)",["CAM"],["LW"],84,"creator"),P("olmo","Dani Olmo",["CAM"],["ST"],83,"playmaker"),P("nkunku","Christopher Nkunku",["CAM","ST"],[],85,"creator"),P("sesko","Benjamin Šeško ('24)",["ST"],[],81,"power"),P("openda","Loïs Openda",["ST"],[],82,"pace")]},
/* ROMA */
{club:"ROM",era:"90s",note:"Totti emerges",players:[P("cervone","Giovanni Cervone",["GK"],[],79,"keeper"),P("aldair","Aldair",["CB"],[],84,"wall"),P("cafu","Cafu",["RB"],[],84,"fullback"),P("giannini","Giuseppe Giannini",["CAM"],["CM"],81,"playmaker"),P("totti","Totti ('99)",["CAM","CF"],["ST"],82,"creator"),P("balbo","Abel Balbo",["ST"],[],81,"poacher")]},
{club:"ROM",era:"00s",note:"Il Capitano's scudetto",players:[P("antonioli","Francesco Antonioli",["GK"],[],81,"keeper"),P("samuel","Walter Samuel",["CB"],[],84,"wall"),P("emerson_r","Emerson",["CDM","CM"],[],83,"anchor"),P("totti","Totti ('04)",["CF","CAM"],["ST"],85,"creator"),P("montella","Vincenzo Montella",["ST"],[],82,"poacher"),P("batistuta","Gabriel Batistuta ('01)",["ST"],[],84,"power")]},
{club:"ROM",era:"10s",note:"De Rossi & Totti",players:[P("alisson","Alisson ('17)",["GK"],[],85,"sweeperk"),P("manolas","Kostas Manolas",["CB"],[],83,"wall"),P("derossi","Daniele De Rossi",["CDM"],["CM"],84,"anchor"),P("pjanic","Miralem Pjanić",["CM","CAM"],[],83,"playmaker"),P("totti","Totti ('14)",["CF","CAM"],[],82,"creator"),P("salah","Mohamed Salah ('16)",["RW"],["ST"],84,"pace"),P("dzeko","Edin Džeko ('17)",["ST"],[],84,"power")]},
{club:"ROM",era:"20s",note:"Mourinho & Dybala",players:[P("ruipatricio","Rui Patrício",["GK"],[],83,"keeper"),P("mancini","Gianluca Mancini",["CB"],[],82,"wall"),P("ndicka","Evan Ndicka",["CB","LB"],[],81,"wall"),P("cristante","Bryan Cristante",["CDM"],["CM"],81,"anchor"),P("pellegrini","Lorenzo Pellegrini",["CAM"],["CM"],83,"playmaker"),P("dybala","Paulo Dybala",["CAM","ST"],[],85,"creator"),P("abraham","Tammy Abraham",["ST"],[],81,"power"),P("belotti","Andrea Belotti",["ST"],[],80,"power"),P("dovbyk","Artem Dovbyk",["ST"],[],82,"poacher"),P("lukaku","Romelu Lukaku ('23)",["ST"],[],83,"power")]},
/* LAZIO */
{club:"LAZ",era:"90s",note:"2000 scudetto core",players:[P("marchegiani","Luca Marchegiani",["GK"],[],82,"keeper"),P("nesta","Alessandro Nesta",["CB"],[],86,"wall"),P("veron","Juan Sebastián Verón",["CM"],["CAM"],84,"playmaker"),P("nedved","Pavel Nedvěd",["CAM","CM"],[],85,"box2box"),P("salas","Marcelo Salas",["ST"],[],84,"poacher")]},
{club:"LAZ",era:"00s",note:"Inzaghi's goals",players:[P("peruzzi","Angelo Peruzzi",["GK"],[],83,"keeper"),P("couto","Fernando Couto",["CB"],[],80,"wall"),P("fiore","Stefano Fiore",["CAM"],["CM"],82,"playmaker"),P("pandev","Goran Pandev",["CAM","ST"],[],82,"creator"),P("sinzaghi","Simone Inzaghi",["ST"],[],82,"poacher"),P("rocchi","Tommaso Rocchi",["ST"],[],81,"poacher")]},
{club:"LAZ",era:"10s",note:"Immobile & SMS",players:[P("marchetti","Federico Marchetti",["GK"],[],81,"keeper"),P("devrij","Stefan de Vrij",["CB"],[],83,"ballplayer"),P("sms","Milinković-Savić",["CM"],["CAM"],85,"box2box"),P("luisalberto","Luis Alberto",["CAM"],["CM"],84,"playmaker"),P("klose","Miroslav Klose",["ST"],[],82,"poacher"),P("immobile","Ciro Immobile",["ST"],[],86,"poacher")]},
{club:"LAZ",era:"20s",note:"Sarri's Lazio",players:[P("provedel","Ivan Provedel",["GK"],[],82,"keeper"),P("romagnoli","Alessio Romagnoli",["CB"],[],82,"wall"),P("sms","Milinković-Savić ('22)",["CM"],["CAM"],86,"box2box"),P("felipeanderson","Felipe Anderson",["RW","LW"],[],82,"winger"),P("zaccagni","Mattia Zaccagni",["LW"],["CAM"],82,"winger"),P("luisalberto","Luis Alberto ('22)",["CAM"],["CM"],83,"playmaker"),P("immobile","Ciro Immobile ('22)",["ST"],[],84,"poacher")]},
/* NAPOLI */
{club:"NAP",era:"80s",note:"Maradona's Napoli",players:[P("garella","Claudio Garella",["GK"],[],80,"keeper"),P("ferrara","Ciro Ferrara",["CB"],[],84,"wall"),P("denapoli","Fernando De Napoli",["CM"],["CDM"],80,"engine"),P("maradona","Diego Maradona",["CAM","CF"],["ST"],97,"magician",true),P("careca","Careca",["ST"],[],85,"pace"),P("giordano","Bruno Giordano",["ST"],[],82,"poacher")]},
{club:"NAP",era:"00s",note:"Back from the abyss",players:[P("navarro","Gennaro Iezzo",["GK"],[],80,"keeper"),P("pcannavaro","Paolo Cannavaro",["CB"],[],80,"wall"),P("hamsik","Marek Hamšík ('09)",["CAM","CM"],[],84,"box2box"),P("lavezzi","Ezequiel Lavezzi",["LW"],["ST"],83,"pace"),P("quagliarella","Fabio Quagliarella",["ST","CAM"],[],83,"creator"),P("denis","German Denis",["ST"],[],81,"poacher")]},
{club:"NAP",era:"10s",note:"Sarri-ball",players:[P("reina","Pepe Reina ('14)",["GK"],[],84,"keeper"),P("koulibaly","Kalidou Koulibaly",["CB"],[],86,"wall"),P("albiol","Raúl Albiol",["CB"],[],82,"wall"),P("jorginho","Jorginho",["CDM"],["CM"],83,"anchor"),P("allan","Allan",["CDM"],["CM"],82,"anchor"),P("hamsik","Marek Hamšík ('16)",["CM","CAM"],[],84,"box2box"),P("callejon","José Callejón",["RW"],[],82,"pace"),P("insigne","Lorenzo Insigne",["LW"],["CAM"],84,"creator"),P("quagliarella","Fabio Quagliarella ('10)",["ST"],[],82,"creator"),P("higuain","Gonzalo Higuaín ('16)",["ST"],[],86,"poacher"),P("mertens","Dries Mertens",["ST","CAM"],[],84,"complete")]},
{club:"NAP",era:"20s",note:"2023 scudetto",players:[P("meret","Alex Meret",["GK"],[],83,"keeper"),P("kim","Kim Min-jae",["CB"],[],84,"sweeper"),P("dilorenzo","Giovanni Di Lorenzo",["RB"],[],82,"fullback"),P("lobotka","Stanislav Lobotka",["CDM"],["CM"],83,"anchor"),P("anguissa","Zambo Anguissa",["CM"],["CDM"],82,"box2box"),P("mctominay","Scott McTominay",["CM"],["CAM"],84,"box2box"),P("kdb","Kevin De Bruyne ('25)",["CAM"],["CM"],85,"playmaker"),P("zielinski","Piotr Zieliński",["CAM"],["CM"],83,"playmaker"),P("kvara","Khvicha Kvaratskhelia",["LW"],[],87,"magician"),P("osimhen","Victor Osimhen",["ST"],[],87,"power"),P("lukaku","Romelu Lukaku ('24)",["ST"],[],83,"power"),P("hojlund","Rasmus Højlund ('25)",["ST"],[],80,"poacher")]},
/* AC MILAN */
{club:"MIL",era:"90s",note:"The immortals",players:[P("rossi","Sebastiano Rossi",["GK"],[],84,"keeper"),P("baresi","Franco Baresi",["CB"],[],90,"ballplayer"),P("maldini","Paolo Maldini",["LB","CB"],[],89,"fullback"),P("boban","Zvonimir Boban",["CM"],["CDM"],84,"box2box"),P("costacurta","Alessandro Costacurta",["CB"],[],83,"wall"),P("desailly","Marcel Desailly ('96)",["CDM","CB"],[],87,"anchor"),P("donadoni","Roberto Donadoni",["RM","CM"],[],82,"winger"),P("savicevic","Dejan Savićević",["CAM"],["RW"],84,"magician"),P("vanbasten","Marco van Basten",["ST"],[],90,"poacher"),P("weah","George Weah ('96)",["ST"],[],86,"complete")]},
{club:"MIL",era:"00s",note:"2007 kings of Europe",players:[P("dida","Dida",["GK"],[],85,"keeper"),P("nesta","Alessandro Nesta ('07)",["CB"],[],87,"wall"),P("maldini","Paolo Maldini ('05)",["CB","LB"],[],88,"ballplayer"),P("pirlo","Andrea Pirlo ('07)",["CDM","CM"],[],88,"playmaker"),P("gattuso","Gennaro Gattuso",["CDM"],["CM"],83,"anchor"),P("ambrosini","Massimo Ambrosini",["CM"],["CDM"],81,"engine"),P("seedorf","Clarence Seedorf",["CM","CAM"],[],85,"box2box"),P("kaka","Kaká",["CAM"],["CM"],90,"magician"),P("ronaldinho","Ronaldinho ('09)",["LW","CAM"],[],84,"magician"),P("beckham","David Beckham ('09)",["RM","CM"],[],83,"winger"),P("sheva","Andriy Shevchenko",["ST"],[],88,"complete"),P("pinzaghi","Filippo Inzaghi",["ST"],[],85,"poacher")]},
{club:"MIL",era:"10s",note:"The lean years",players:[P("abbiati","Christian Abbiati",["GK"],[],82,"keeper"),P("thiagosilva","Thiago Silva ('11)",["CB"],[],84,"ballplayer"),P("vanbommel","Mark van Bommel",["CDM"],["CM"],82,"anchor"),P("seedorf","Clarence Seedorf ('11)",["CM","CAM"],[],84,"box2box"),P("bonaventura","Giacomo Bonaventura",["CM","CAM"],[],82,"box2box"),P("elshaarawy","Stephan El Shaarawy",["LW"],["ST"],81,"pace"),P("robinho","Robinho ('11)",["LW","ST"],["RW"],81,"magician"),P("balotelli","Mario Balotelli ('13)",["ST"],[],83,"power"),P("zlatan","Zlatan Ibrahimović ('11)",["ST"],[],86,"power")]},
{club:"MIL",era:"20s",note:"2022 scudetto",players:[P("maignan","Mike Maignan ('22)",["GK"],[],85,"keeper"),P("tomori","Fikayo Tomori",["CB"],[],83,"sweeper"),P("theo","Theo Hernández",["LB"],[],84,"fullback"),P("tonali","Sandro Tonali",["CM"],["CDM"],82,"box2box"),P("bennacer","Ismaël Bennacer",["CM"],["CDM"],79,"engine"),P("pulisic","Christian Pulisic",["RW","LW"],["CAM"],84,"winger"),P("leao","Rafael Leão",["LW"],[],86,"pace"),P("zlatan","Zlatan Ibrahimović ('21)",["ST"],[],83,"power"),P("giroud","Olivier Giroud ('22)",["ST"],[],82,"power")]},
/* INTER */
{club:"INT",era:"90s",note:"Il Fenomeno",players:[P("pagliuca","Gianluca Pagliuca",["GK"],[],82,"keeper"),P("bergomi","Beppe Bergomi",["CB"],[],82,"wall"),P("zanetti","Javier Zanetti",["RB","CM"],[],84,"fullback"),P("djorkaeff","Youri Djorkaeff",["CAM"],["ST"],84,"creator"),P("baggio","Roberto Baggio",["CAM"],["CF"],86,"magician"),P("r9","Ronaldo Nazário ('98)",["ST"],[],90,"pace"),P("zamorano","Iván Zamorano",["ST"],[],82,"poacher")]},
{club:"INT",era:"00s",note:"2010 treble",players:[P("juliocesar","Júlio César",["GK"],[],86,"keeper"),P("lucio","Lúcio ('10)",["CB"],[],86,"wall"),P("samuel","Walter Samuel ('10)",["CB"],[],85,"wall"),P("cordoba","Iván Córdoba",["CB"],[],82,"wall"),P("chivu","Cristian Chivu",["CB","LB"],[],81,"wall"),P("maicon","Maicon",["RB"],[],88,"fullback"),P("zanetti","Javier Zanetti ('10)",["RB","CM"],[],84,"fullback"),P("cambiasso","Esteban Cambiasso",["CDM","CM"],[],84,"anchor"),P("vieira","Patrick Vieira ('07)",["CM"],["CDM"],84,"engine"),P("stankovic","Dejan Stanković",["CM","CAM"],[],83,"box2box"),P("sneijder","Wesley Sneijder",["CAM"],[],86,"playmaker"),P("figo","Luís Figo ('07)",["RW"],["CAM"],84,"winger"),P("etoo","Samuel Eto'o ('10)",["ST"],[],86,"pace"),P("milito","Diego Milito",["ST"],[],85,"poacher"),P("adriano_st","Adriano",["ST"],[],85,"power"),P("zlatan","Zlatan Ibrahimović ('08)",["ST"],[],85,"power")]},
{club:"INT",era:"10s",note:"The wilderness",players:[P("handanovic","Samir Handanović",["GK"],[],85,"keeper"),P("miranda","João Miranda",["CB"],[],82,"wall"),P("vidic","Nemanja Vidić ('15)",["CB"],[],82,"wall"),P("brozovic","Marcelo Brozović",["CDM"],["CM"],82,"anchor"),P("shaqiri","Xherdan Shaqiri",["RW","CAM"],[],82,"creator"),P("podolski","Lukas Podolski",["LW","ST"],[],81,"pace"),P("perisic","Ivan Perišić",["LW"],["RW"],83,"winger"),P("forlan","Diego Forlán ('12)",["ST"],[],82,"complete"),P("icardi","Mauro Icardi",["ST"],[],84,"poacher"),P("milito","Diego Milito ('12)",["ST"],[],84,"poacher")]},
{club:"INT",era:"20s",note:"Scudetti return",players:[P("sommer","Yann Sommer",["GK"],[],84,"keeper"),P("onana","André Onana ('22)",["GK"],[],83,"sweeperk"),P("bastoni","Alessandro Bastoni",["CB"],[],84,"ballplayer"),P("skriniar","Milan Škriniar",["CB"],[],84,"wall"),P("dumfries","Denzel Dumfries",["RWB","RB"],[],82,"fullback"),P("dimarco","Federico Dimarco",["LWB","LB"],[],83,"fullback"),P("barella","Nicolò Barella",["CM"],["CDM"],85,"box2box"),P("calhanoglu","Hakan Çalhanoğlu ('23)",["CM","CDM"],[],85,"playmaker"),P("lautaro","Lautaro Martínez",["ST"],[],87,"complete"),P("mthuram","Marcus Thuram",["ST"],["LW"],83,"power"),P("lukaku","Romelu Lukaku ('21)",["ST"],[],85,"power")]},
/* JUVENTUS */
{club:"JUV",era:"90s",note:"Del Piero & Zidane",players:[P("peruzzi","Angelo Peruzzi ('97)",["GK"],[],83,"keeper"),P("montero","Paolo Montero",["CB"],[],83,"wall"),P("conte","Antonio Conte",["CM"],["CDM"],81,"engine"),P("davids","Edgar Davids",["CM","CDM"],[],84,"box2box"),P("zidane","Zinédine Zidane ('98)",["CAM","CM"],[],89,"magician"),P("delpiero","Alessandro Del Piero",["CF","ST"],[],86,"creator"),P("vialli","Gianluca Vialli ('95)",["ST"],[],83,"poacher")]},
{club:"JUV",era:"00s",note:"Buffon & Nedvěd",players:[P("buffon","Gianluigi Buffon",["GK"],[],89,"keeper"),P("lthuram","Lilian Thuram",["CB","RB"],[],85,"wall"),P("cannavaro","Fabio Cannavaro ('06)",["CB"],[],86,"wall"),P("nedved","Pavel Nedvěd ('03)",["CAM","CM"],[],88,"box2box"),P("camoranesi","Mauro Camoranesi",["RM","RW"],[],82,"winger"),P("tiago","Tiago",["CM"],["CDM"],81,"box2box"),P("delpiero","Del Piero ('06)",["CF","ST"],[],86,"creator"),P("trezeguet","David Trezeguet",["ST"],[],85,"poacher"),P("amauri","Amauri",["ST"],[],82,"power"),P("iaquinta","Vincenzo Iaquinta",["ST"],["RW"],81,"poacher")]},
{club:"JUV",era:"10s",note:"Nine in a row",players:[P("buffon","Gianluigi Buffon ('17)",["GK"],[],88,"keeper"),P("chiellini","Giorgio Chiellini",["CB"],[],89,"wall"),P("bonucci","Leonardo Bonucci",["CB"],[],86,"ballplayer"),P("barzagli","Andrea Barzagli ('15)",["CB"],[],84,"wall"),P("pirlo","Andrea Pirlo ('12)",["CM","CDM"],[],88,"playmaker"),P("vidal","Arturo Vidal",["CM"],["CDM"],85,"box2box"),P("marchisio","Claudio Marchisio",["CM"],["CDM"],83,"box2box"),P("pogba","Paul Pogba ('15)",["CM","CAM"],[],85,"box2box"),P("krasic","Miloš Krasić",["RW"],[],81,"winger"),P("dybala","Paulo Dybala ('18)",["CAM","ST"],[],86,"creator"),P("tevez","Carlos Tévez ('14)",["ST"],[],85,"power"),P("vucinic","Mirko Vučinić",["ST"],[],82,"poacher"),P("matri","Alessandro Matri",["ST"],[],80,"poacher"),P("quagliarella","Fabio Quagliarella ('12)",["ST"],[],82,"creator"),P("anelka","Nicolas Anelka ('13)",["ST"],[],81,"complete"),P("fllorente","Fernando Llorente",["ST"],[],83,"poacher"),P("mandzukic","Mario Mandžukić ('16)",["ST"],["LW"],83,"power"),P("higuain","Gonzalo Higuaín ('17)",["ST"],[],85,"poacher"),P("cr7","Cristiano Ronaldo ('19)",["LW","ST"],[],92,"complete")]},
{club:"JUV",era:"20s",note:"Allegri's grind",players:[P("szczesny","Wojciech Szczęsny",["GK"],[],84,"keeper"),P("bremer","Gleison Bremer",["CB"],[],83,"wall"),P("kalulu","Pierre Kalulu",["CB","RB"],[],81,"sweeper"),P("locatelli","Manuel Locatelli",["CM"],["CDM"],81,"playmaker"),P("mckennie","Weston McKennie",["CM"],["RM"],80,"box2box"),P("kthuram","Khéphren Thuram",["CM"],["CDM"],82,"box2box"),P("chiesa","Federico Chiesa",["RW"],["LW"],83,"winger"),P("vlahovic","Dušan Vlahović",["ST"],[],84,"power")]},
/* ATALANTA */
{club:"ATA",era:"90s",note:"Lower-mid years",players:[P("ferron","Massimo Ferron",["GK"],[],76,"keeper"),P("morfeo","Domenico Morfeo",["CAM"],["LW"],81,"magician"),P("caniggia","Claudio Caniggia",["ST"],["RW"],81,"pace"),P("lentini","Gianluigi Lentini",["RW"],[],78,"winger")]},
{club:"ATA",era:"00s",note:"Yo-yo decade",players:[P("coppola","Ivan Pelizzoli",["GK"],[],77,"keeper"),P("bellini","Bellini",["CB"],[],76,"wall"),P("doni","Cristiano Doni",["CAM"],["CM"],80,"playmaker"),P("floccari","Sergio Floccari",["ST"],[],78,"poacher"),P("pinilla","Mauricio Pinilla",["ST"],[],78,"poacher")]},
{club:"ATA",era:"10s",note:"Gasperini's rise",players:[P("gollini","Pierluigi Gollini",["GK"],[],81,"keeper"),P("toloi","Rafael Tolói",["CB","RB"],[],82,"sweeper"),P("gosens","Robin Gosens",["LWB"],["LM"],81,"fullback"),P("deroon","Marten de Roon",["CDM"],["CM"],81,"anchor"),P("gomez","Papu Gómez",["CAM"],["LW"],84,"magician"),P("ilicic","Josip Iličić",["CAM","ST"],[],83,"creator"),P("zapata","Duván Zapata",["ST"],[],83,"power"),P("muriel","Luis Muriel",["ST"],["CAM"],82,"pace")]},
{club:"ATA",era:"20s",note:"Europa winners '24",players:[P("musso","Juan Musso",["GK"],[],83,"keeper"),P("scalvini","Giorgio Scalvini",["CB"],[],82,"sweeper"),P("koopmeiners","Teun Koopmeiners",["CM","CAM"],[],84,"box2box"),P("deketelaere","De Ketelaere",["CAM","ST"],[],83,"creator"),P("lookman","Ademola Lookman",["LW","ST"],[],85,"pace"),P("scamacca","Gianluca Scamacca",["ST"],[],82,"power")]},
/* FIORENTINA */
{club:"FIO",era:"90s",note:"Batigol & Rui Costa",players:[P("toldo","Francesco Toldo",["GK"],[],84,"keeper"),P("firicano","Aldo Firicano",["CB"],[],78,"wall"),P("ruicosta","Rui Costa",["CAM"],["CM"],86,"playmaker"),P("batistuta","Gabriel Batistuta ('96)",["ST"],[],87,"poacher"),P("edmundo","Edmundo",["ST"],["CAM"],82,"pace")]},
{club:"FIO",era:"00s",note:"Toni's goals",players:[P("frey","Sébastien Frey",["GK"],[],82,"keeper"),P("ujfalusi","Tomáš Ujfaluši",["CB"],[],80,"wall"),P("montolivo","Riccardo Montolivo",["CM","CAM"],[],81,"playmaker"),P("mutu","Adrian Mutu",["CAM","ST"],[],82,"creator"),P("toni","Luca Toni",["ST"],[],85,"power"),P("gilardino","Alberto Gilardino",["ST"],[],82,"poacher")]},
{club:"FIO",era:"10s",note:"Montella's flair",players:[P("neto","Norberto Neto",["GK"],[],82,"keeper"),P("savic","Stefan Savić",["CB"],[],81,"wall"),P("montolivo","Riccardo Montolivo ('11)",["CM"],["CDM"],81,"playmaker"),P("borjavalero","Borja Valero",["CM","CAM"],[],82,"playmaker"),P("jovetic","Stevan Jovetić",["CAM","ST"],[],83,"creator"),P("grossi","Giuseppe Rossi",["ST"],[],83,"poacher"),P("mgomez","Mario Gómez",["ST"],[],82,"poacher")]},
{club:"FIO",era:"20s",note:"Italiano's side",players:[P("degea","David de Gea ('24)",["GK"],[],84,"keeper"),P("milenkovic","Nikola Milenković",["CB"],[],82,"wall"),P("bonaventura","Giacomo Bonaventura ('23)",["CAM","CM"],[],82,"box2box"),P("nicogonzalez","Nicolás González",["LW"],["RW"],83,"winger"),P("ribery","Franck Ribéry ('20)",["RW","LW"],[],82,"creator"),P("kean","Moise Kean",["ST"],[],83,"pace"),P("vlahovic","Dušan Vlahović ('21)",["ST"],[],83,"power")]},
/* ATLÉTICO */
{club:"ATM",era:"90s",note:"The '96 Doblete",players:[P("molina","José Molina",["GK"],[],81,"keeper"),P("solozabal","Roberto Solozábal",["CB"],[],80,"wall"),P("simeone_p","Diego Simeone (player)",["CM","CDM"],[],82,"engine"),P("caminero","José Luis Caminero",["CM"],["CAM"],82,"box2box"),P("pantic","Milinko Pantić",["CAM"],[],82,"playmaker"),P("kiko","Kiko Narváez",["ST","CF"],[],82,"creator"),P("vieri","Christian Vieri ('97)",["ST"],[],84,"power")]},
{club:"ATM",era:"00s",note:"Relegation to Torres",players:[P("leofranco","Leo Franco",["GK"],[],79,"keeper"),P("perea","Luis Perea",["CB"],[],79,"wall"),P("maxi","Maxi Rodríguez",["CM","RW"],[],80,"box2box"),P("simao","Simão Sabrosa",["LW"],[],81,"winger"),P("aguero","Sergio Agüero ('09)",["ST"],[],85,"pace"),P("forlan","Diego Forlán ('09)",["ST"],["CF"],84,"complete"),P("torres","Fernando Torres ('07)",["ST"],[],86,"pace")]},
{club:"ATM",era:"10s",note:"Simeone's iron",players:[P("oblak","Jan Oblak",["GK"],[],89,"keeper"),P("godin","Diego Godín",["CB"],[],87,"wall"),P("miranda","João Miranda ('14)",["CB"],[],83,"wall"),P("filipeluis","Filipe Luís",["LB"],[],82,"fullback"),P("juanfran","Juanfran",["RB"],[],81,"fullback"),P("koke","Koke",["CM","CAM"],[],84,"playmaker"),P("gabi","Gabi",["CDM"],["CM"],82,"anchor"),P("saul","Saúl Ñíguez",["CM"],["LB"],83,"box2box"),P("griezmann","Antoine Griezmann ('16)",["ST","CF"],["LW"],88,"creator"),P("torres","Fernando Torres ('16)",["ST"],[],84,"pace"),P("villa","David Villa ('14)",["ST"],[],84,"complete"),P("costa_d","Diego Costa ('14)",["ST"],[],85,"power"),P("falcao","Radamel Falcao ('12)",["ST"],[],87,"poacher")]},
{club:"ATM",era:"20s",note:"Grinding champions",players:[P("oblak","Jan Oblak ('21)",["GK"],[],89,"keeper"),P("gimenez","José Giménez",["CB"],[],85,"wall"),P("hancko","David Hancko",["CB","LB"],[],82,"ballplayer"),P("pubill","Marc Pubill",["RB"],[],79,"fullback"),P("depaul","Rodrigo De Paul",["CM"],["CAM"],82,"engine"),P("baena","Álex Baena",["CAM"],["LW"],83,"playmaker"),P("llorente","Marcos Llorente",["CM","RB"],[],83,"box2box"),P("gsimeone","Giuliano Simeone",["RW"],["RWB"],80,"winger"),P("griezmann","Antoine Griezmann ('23)",["CF","ST"],["LW"],86,"creator"),P("lookman","Ademola Lookman ('25)",["LW","ST"],[],84,"pace"),P("morata","Álvaro Morata",["ST"],[],81,"complete"),P("sorloth","Alexander Sørloth",["ST"],[],82,"power"),P("alvarez","Julián Álvarez",["ST","CAM"],[],86,"complete")]},
/* BARCELONA */
{club:"BAR",era:"90s",note:"Dream Team & beyond",players:[P("zubizarreta","Andoni Zubizarreta",["GK"],[],84,"keeper"),P("koeman","Ronald Koeman",["CB","CDM"],[],84,"ballplayer"),P("pep_p","Pep Guardiola (player)",["CDM","CM"],[],83,"playmaker"),P("figo","Luís Figo ('99)",["RW"],["CAM"],86,"winger"),P("laudrup","Michael Laudrup",["CAM"],[],86,"creator"),P("stoichkov","Hristo Stoichkov",["LW","ST"],[],85,"complete"),P("romario","Romário ('94)",["ST"],[],88,"poacher"),P("r9","Ronaldo Nazário ('97)",["ST"],[],90,"pace"),P("rivaldo","Rivaldo ('99)",["CAM","LW"],[],87,"magician")]},
{club:"BAR",era:"00s",note:"Ronaldinho's circus",players:[P("valdes","Víctor Valdés",["GK"],[],84,"keeper"),P("puyol","Carles Puyol",["CB"],["RB"],86,"wall"),P("marquez","Rafael Márquez",["CB"],["CDM"],82,"ballplayer"),P("danialves","Dani Alves ('09)",["RB"],[],83,"fullback"),P("abidal","Eric Abidal",["LB","CB"],[],82,"fullback"),P("xavi","Xavi ('09)",["CM"],["CDM"],87,"playmaker"),P("iniesta","Andrés Iniesta ('09)",["CM","CAM"],[],87,"magician"),P("yaya","Yaya Touré ('09)",["CDM","CM"],[],83,"box2box"),P("deco","Deco",["CAM","CM"],[],84,"playmaker"),P("ronaldinho","Ronaldinho ('06)",["LW","CAM"],[],91,"magician",true),P("etoo","Samuel Eto'o",["ST"],[],87,"pace"),P("henry","Thierry Henry ('08)",["LW","ST"],[],84,"complete"),P("messi","Lionel Messi ('08 young)",["RW"],["CAM"],84,"magician")]},
{club:"BAR",era:"10s",note:"MSN & tiki-taka",players:[P("terstegen","Marc-André ter Stegen",["GK"],[],88,"sweeperk"),P("pique","Gerard Piqué",["CB"],[],86,"ballplayer"),P("masche","Javier Mascherano ('15)",["CB","CDM"],[],84,"anchor"),P("alba","Jordi Alba",["LB"],[],84,"fullback"),P("danialves","Dani Alves ('14)",["RB"],[],84,"fullback"),P("busquets","Sergio Busquets ('15)",["CDM"],["CM"],86,"anchor"),P("xavi","Xavi ('11)",["CM"],[],88,"playmaker"),P("iniesta","Andrés Iniesta ('12)",["CM","CAM"],[],88,"magician"),P("rakitic","Ivan Rakitić ('15)",["CM"],["CAM"],85,"playmaker"),P("pedro","Pedro ('12)",["RW","LW"],[],83,"winger"),P("sanchez","Alexis Sánchez ('13)",["RW","ST"],[],83,"pace"),P("bojan","Bojan Krkić",["ST"],["LW"],79,"poacher"),P("messi","Lionel Messi ('12)",["RW","CF"],["CAM"],95,"magician",true),P("suarez","Luis Suárez ('16)",["ST"],[],89,"complete"),P("villa","David Villa ('11)",["ST"],["LW"],85,"complete"),P("neymar","Neymar ('15)",["LW"],["CAM"],88,"magician")]},
{club:"BAR",era:"20s",note:"Post-Messi to Yamal",players:[P("terstegen","Ter Stegen ('23)",["GK"],[],83,"sweeperk"),P("joangarcia","Joan Garcia",["GK"],[],86,"keeper"),P("araujo","Ronald Araújo",["CB"],["RB"],82,"wall"),P("kounde","Jules Koundé",["CB","RB"],[],84,"sweeper"),P("cubarsi","Pau Cubarsí",["CB"],[],83,"ballplayer"),P("balde","Alejandro Balde",["LB"],[],80,"fullback"),P("dejong","Frenkie de Jong",["CM"],["CDM"],84,"box2box"),P("pedri","Pedri",["CAM","CM"],[],88,"playmaker"),P("gavi","Gavi",["CM"],["CAM"],82,"engine"),P("olmo","Dani Olmo ('24)",["CAM"],["ST"],85,"playmaker"),P("fermin","Fermin Lopez",["CAM"],["CM"],85,"magician"),P("lewa","Robert Lewandowski ('23)",["ST"],[],88,"poacher"),P("messi","Lionel Messi",["RW","CF"],["CAM"],91,"magician",true),P("raphinha","Raphinha",["LW","RW"],[],84,"winger"),P("yamal","Lamine Yamal ('24)",["RW"],[],89,"creator")]},
/* REAL MADRID */
{club:"RMA",era:"90s",note:"La Séptima",players:[P("illgner","Bodo Illgner",["GK"],[],82,"keeper"),P("hierro","Fernando Hierro",["CB","CDM"],[],85,"ballplayer"),P("robcarlos","Roberto Carlos ('98)",["LB"],[],87,"fullback"),P("redondo","Fernando Redondo",["CM","CDM"],[],85,"playmaker"),P("seedorf","Clarence Seedorf ('98)",["CM"],["CAM"],83,"box2box"),P("raul","Raúl",["ST"],["CF"],87,"poacher"),P("suker","Davor Šuker",["ST"],[],84,"poacher")]},
{club:"RMA",era:"00s",note:"The Galácticos",players:[P("casillas","Iker Casillas",["GK"],[],88,"keeper"),P("robcarlos","Roberto Carlos ('03)",["LB"],[],86,"fullback"),P("cannavaro","Fabio Cannavaro ('07)",["CB"],[],86,"wall"),P("ramos","Sergio Ramos ('07 young)",["CB","RB"],[],82,"wall"),P("makelele","Claude Makélélé ('03)",["CDM"],[],84,"anchor"),P("zidane","Zinédine Zidane ('03)",["CAM","CM"],[],92,"magician",true),P("guti","Guti",["CAM","CM"],[],83,"playmaker"),P("figo","Luís Figo ('02)",["RW"],["CAM"],86,"winger"),P("beckham","David Beckham ('05)",["RM","CM"],[],84,"winger"),P("raul","Raúl ('04)",["ST"],[],86,"poacher"),P("r9","Ronaldo Nazário ('03)",["ST"],[],92,"complete",true),P("vannistelrooy","Ruud van Nistelrooy",["ST"],[],87,"poacher")]},
{club:"RMA",era:"10s",note:"BBC & the three-peat",players:[P("navas","Keylor Navas",["GK"],[],85,"keeper"),P("casillas","Iker Casillas ('13)",["GK"],[],84,"keeper"),P("ramos","Sergio Ramos",["CB"],["RB"],87,"wall"),P("nacho","Nacho",["CB"],["RB"],77,"wall"),P("pepe","Pepe",["CB"],[],84,"wall"),P("varane","Raphaël Varane",["CB"],[],84,"sweeper"),P("marcelo","Marcelo",["LB"],[],86,"fullback"),P("carvajal","Dani Carvajal",["RB"],[],82,"fullback"),P("modric","Luka Modrić ('17)",["CM","CAM"],[],89,"playmaker"),P("xabi","Xabi Alonso",["CM","CDM"],[],85,"playmaker"),P("kroos","Toni Kroos",["CM"],["CDM"],86,"playmaker"),P("casemiro","Casemiro ('17)",["CDM"],[],85,"anchor"),P("isco","Isco",["CAM"],["CM"],84,"creator"),P("ozil","Mesut Özil",["CAM"],[],87,"playmaker"),P("kaka","Kaká",["CAM"],["CM"],83,"magician"),P("dimaria","Ángel Di María",["RW","LW"],["CAM"],84,"winger"),P("benzema","Karim Benzema ('14)",["ST"],[],88,"complete"),P("cr7","Cristiano Ronaldo ('14)",["LW","ST"],[],93,"complete",true),P("bale","Gareth Bale ('14)",["RW"],["ST"],90,"complete")]},
{club:"RMA",era:"20s",note:"Ancelotti's encore",players:[P("courtois","Thibaut Courtois ('22)",["GK"],[],89,"keeper"),P("militao","Éder Militão",["CB"],[],84,"sweeper"),P("rudiger","Antonio Rüdiger",["CB"],[],84,"wall"),P("alaba","David Alaba",["CB"],["LB"],84,"ballplayer"),P("taa","Trent Alexander-Arnold ('25)",["RB"],[],84,"fullback"),P("modric","Luka Modrić",["CM","CAM"],[],86,"playmaker"),P("valverde","Federico Valverde",["CM"],["RM"],86,"box2box"),P("tchouameni","Aurélien Tchouaméni",["CDM"],["CB"],84,"anchor"),P("kroos","Toni Kroos ('23)",["CM"],["CDM"],90,"playmaker"),P("bellingham","Jude Bellingham ('24)",["CAM","CM"],[],88,"box2box"),P("vini","Vinícius Jr ('24)",["LW"],[],89,"pace"),P("rodrygo","Rodrygo",["RW"],["ST"],84,"pace"),P("benzema","Karim Benzema ('22)",["ST"],[],90,"complete"),P("mbappe","Kylian Mbappé ('24)",["ST","LW"],[],91,"pace")]},
/* VALENCIA */
{club:"VAL",era:"90s",note:"Mendieta's rise",players:[P("canizares","Santiago Cañizares",["GK"],[],84,"keeper"),P("djukic","Miroslav Đukić",["CB"],[],80,"wall"),P("mendieta","Gaizka Mendieta",["CM","CAM"],[],84,"box2box"),P("ortega","Ariel Ortega",["CAM"],[],82,"magician"),P("claudiolopez","Claudio López",["ST","LW"],[],83,"pace")]},
{club:"VAL",era:"00s",note:"Two titles & a UEFA Cup",players:[P("canizares","Cañizares ('04)",["GK"],[],85,"keeper"),P("ayala","Roberto Ayala",["CB"],[],86,"wall"),P("marchena","Carlos Marchena",["CB"],[],82,"wall"),P("albelda","David Albelda",["CDM"],[],81,"anchor"),P("baraja","Rubén Baraja",["CM"],["CDM"],82,"box2box"),P("aimar","Pablo Aimar",["CAM"],[],84,"magician"),P("joaquin","Joaquín",["RW","RM"],[],82,"winger"),P("vicente","Vicente",["LW"],[],83,"winger"),P("villa","David Villa ('06)",["ST"],[],87,"complete")]},
{club:"VAL",era:"10s",note:"The slow decline",players:[P("diegoalves","Diego Alves",["GK"],[],82,"keeper"),P("otamendi","Nicolás Otamendi",["CB"],[],82,"wall"),P("davidsilva","David Silva ('10)",["CAM"],["CM"],85,"playmaker"),P("parejo","Dani Parejo",["CM","CAM"],[],83,"playmaker"),P("banega","Éver Banega ('14)",["CM"],["CAM"],83,"playmaker"),P("rodrigom","Rodrigo Moreno",["ST"],[],81,"pace"),P("alcacer","Paco Alcácer",["ST"],[],80,"poacher")]},
{club:"VAL",era:"20s",note:"Near the bottom",players:[P("mamardashvili","Giorgi Mamardashvili",["GK"],[],83,"keeper"),P("paulista","Gabriel Paulista",["CB"],[],79,"wall"),P("gaya","José Gayà",["LB"],[],80,"fullback"),P("pepelu","Pepelu",["CM","CDM"],[],78,"anchor"),P("soler","Carlos Soler",["CM"],["CAM"],80,"box2box"),P("guedes","Gonçalo Guedes",["LW","ST"],[],80,"pace"),P("hugoduro","Hugo Duro",["ST"],[],76,"poacher")]},
/* SEVILLA */
{club:"SEV",era:"90s",note:"The Maradona cameo",players:[P("unzue","Juan Carlos Unzué",["GK"],[],77,"keeper"),P("jarni","Robert Jarni",["LB","LM"],[],80,"fullback"),P("prosinecki","Robert Prosinečki",["CAM","CM"],[],82,"magician"),P("maradona","Diego Maradona ('92)",["CAM"],["CF"],85,"magician"),P("suker","Davor Šuker ('95)",["ST"],[],82,"poacher")]},
{club:"SEV",era:"00s",note:"Back-to-back UEFA Cups",players:[P("palop","Andrés Palop",["GK"],[],82,"keeper"),P("danialves","Dani Alves ('07)",["RB"],[],83,"fullback"),P("ramos","Sergio Ramos ('05)",["CB","RB"],[],81,"wall"),P("adriano","Adriano Correia",["LB"],[],80,"fullback"),P("poulsen","Christian Poulsen",["CDM"],[],81,"anchor"),P("keita","Seydou Keita",["CM","CDM"],[],82,"engine"),P("jnavas","Jesús Navas",["RW"],[],82,"pace"),P("kanoute","Frédéric Kanouté ('07)",["ST","CF"],[],85,"complete"),P("luisfabiano","Luís Fabiano",["ST"],[],84,"poacher")]},
{club:"SEV",era:"10s",note:"Kings of the Europa",players:[P("sergiorico","Sergio Rico",["GK"],[],82,"keeper"),P("rami","Adil Rami",["CB"],[],81,"wall"),P("kounde","Jules Koundé ('19)",["CB","RB"],[],83,"sweeper"),P("krychowiak","Grzegorz Krychowiak",["CDM"],[],83,"anchor"),P("rakitic","Ivan Rakitić",["CM"],["CAM"],84,"playmaker"),P("banega","Éver Banega ('19)",["CM"],["CAM"],84,"playmaker"),P("vitolo","Vitolo",["LW"],[],82,"winger"),P("gameiro","Kevin Gameiro",["ST"],[],82,"poacher"),P("bacca","Carlos Bacca",["ST"],[],83,"poacher")]},
{club:"SEV",era:"20s",note:"Europa kings, again",players:[P("bono","Yassine Bounou",["GK"],[],84,"keeper"),P("diegocarlos","Diego Carlos",["CB"],[],83,"wall"),P("kounde","Jules Koundé ('21)",["CB","RB"],[],83,"sweeper"),P("fernando","Fernando Reges",["CDM"],[],82,"anchor"),P("rakitic","Ivan Rakitić ('21)",["CM"],["CAM"],82,"playmaker"),P("ocampos","Lucas Ocampos",["RW","ST"],[],81,"winger"),P("ennesyri","Youssef En-Nesyri",["ST"],[],82,"power")]},
];

/* ---------- formations ---------- */
const FORMATIONS:Record<string,Role[]>={
"4-3-3 (Balance)":["GK","LB","CB","CB","RB","CM","CM","CM","LW","ST","RW"],
"4-3-3 (Attack)":["GK","LB","CB","CB","RB","CM","CM","CAM","LW","ST","RW"],
"4-3-3 (Defence)":["GK","LB","CB","CB","RB","CDM","CDM","CAM","LW","ST","RW"],
"4-3-3 (Holding)":["GK","LB","CB","CB","RB","CDM","CM","CM","LW","ST","RW"],
"4-4-2":["GK","LB","CB","CB","RB","LM","CM","CM","RM","ST","ST"],
"4-2-3-1":["GK","LB","CB","CB","RB","CDM","CDM","LM","CAM","RM","ST"],
"3-5-2":["GK","CB","CB","CB","WB","CM","CM","CM","WB","ST","ST"],
"5-4-1":["GK","LWB","CB","CB","CB","RWB","LM","CM","CM","RM","ST"]};
/* visual row sizes (top GK -> bottom attack); must sum to 11 and match FORMATIONS order */
const FORMATION_ROWS:Record<string,number[]>={
"4-3-3 (Balance)":[1,4,3,3],
"4-3-3 (Attack)":[1,4,2,1,3],
"4-3-3 (Defence)":[1,4,2,1,3],
"4-3-3 (Holding)":[1,4,1,2,3],
"4-4-2":[1,4,4,2],
"4-2-3-1":[1,4,2,3,1],
"3-5-2":[1,3,5,2],
"5-4-1":[1,5,4,1]};
const FORM_MOD:Record<string,{att:number;mid:number;def:number}>={"4-3-3 (Balance)":{att:1.08,mid:1.02,def:.98},"4-3-3 (Attack)":{att:1.14,mid:1,def:.9},"4-3-3 (Defence)":{att:.98,mid:1.04,def:1.08},"4-3-3 (Holding)":{att:1.04,mid:1.08,def:1.02},"4-4-2":{att:1.06,mid:1.02,def:1},"4-2-3-1":{att:1.04,mid:1.08,def:1.05},"3-5-2":{att:1.05,mid:1.12,def:.97},"5-4-1":{att:.9,mid:1.02,def:1.14}};
/* difficulty: dominance ceiling per level (tuned by Monte-Carlo so an elite squad hits ~25/10/2% 38-0,
   while a weak squad stays ~0% because the boost is gated by squad strength) */
const DIFF_DOM:Record<string,number>={easy:0.95,medium:1.1,hard:1.35};
/* spin shaping per difficulty: pfScale=rubber-band strength, strBias=skew toward strong(+)/weak(-),
   iconMult=affinity for icon-bearing rosters, floor=uniform blend so no difficulty is fully deterministic */
const DIFF_SPIN:Record<string,{pfScale:number;strBias:number;iconMult:number;floor:number}>={easy:{pfScale:0,strBias:3.2,iconMult:2.4,floor:0},medium:{pfScale:1,strBias:0.5,iconMult:1.2,floor:0.05},hard:{pfScale:1.6,strBias:-1.3,iconMult:1,floor:0.12}};
const DIFFS:{id:"easy"|"medium"|"hard";label:string;emoji:string;desc:string}[]=[
{id:"easy",label:"Easy",emoji:"🍼",desc:"Premium spins, icons everywhere, no rubber-band · build well and 38-0 is a real shot (~25%)."},
{id:"medium",label:"Medium",emoji:"⚖️",desc:"Balanced spins · a perfect 38-0 season is a genuine challenge (~10% at your best)."},
{id:"hard",label:"Hard",emoji:"💀",desc:"Lean spins, no mercy, no rubber-band relief · 38-0 is a rare feat (~2% even at your best)."}];
const UNIT:Record<string,Unit>={GK:"gk",LB:"def",RB:"def",CB:"def",LWB:"def",RWB:"def",CDM:"mid",CM:"mid", WB:"mid",CAM:"mid",LM:"mid",RM:"mid",LW:"att",RW:"att",ST:"att",CF:"att"};
const unitOf=(r:string):Unit=>UNIT[r];
const WB_NATURAL: Role[] = ['LWB', 'RWB'];
const WB_CROSS:   Role[] = ['LM', 'RM', 'LB', 'RB'];
const WINGER_CROSS: Partial<Record<Role, Role[]>> = {
  'LW': ['LM'], 'RW': ['RM'],
  'LM': ['LW'], 'RM': ['RW'],
};
function fitMult(p:Player,role:string){if(p.b.includes(role as Role))return 1;if(p.o.includes(role as Role))return .9;if (role === 'WB') {
  const allRoles = p.b.concat(p.o);
  if (WB_NATURAL.some(r => allRoles.includes(r))) return 0.88; // natural WB players
  if (WB_CROSS.some(r => allRoles.includes(r)))   return 0.72; // LM/RM stretched wide
  return null as any; // LW, RW, CM etc. cannot play WB
}const crossFits = WINGER_CROSS[role as Role] ?? []; const allRoles = p.b.concat(p.o);
  if (crossFits.some(cr => allRoles.includes(cr))) return 0.75;const u=unitOf(role);if(p.b.concat(p.o).some(r=>unitOf(r)===u))return .8;return u==="gk"||p.b.some(r=>unitOf(r)==="gk")?.38:.46;}
const roleFit=(p:Player,role:string)=>p.ov*fitMult(p,role);
function fitClass(p: Player | null, role: string): 'best' | 'ok' | 'cross' | 'unit' | null {
  if (!p) return null;
  if (p.b.includes(role as Role)) return 'best';
  if (p.o.includes(role as Role)) return 'ok';if (role === 'WB') {
    const allRoles = p.b.concat(p.o);
    if (WB_NATURAL.some(r => allRoles.includes(r))) return 'ok';    // LB/RB/LWB/RWB → green-ish
    if (WB_CROSS.some(r => allRoles.includes(r)))   return 'cross'; // LM/RM → orange warning
    return null; // everyone else blocked
  }
  const crossFits = WINGER_CROSS[role as Role] ?? [];
  const allRoles = p.b.concat(p.o);
  if (crossFits.some(cr => allRoles.includes(cr))) return 'cross';
  if (allRoles.some(r => unitOf(r) === unitOf(role))) return 'unit';
  return null;
}
const ARCH:Record<string,[string,number][]>={keeper:[["DIV",0],["REF",2],["HAN",-2]],sweeperk:[["REF",1],["GK",0],["DIS",-4]],wall:[["DEF",1],["PHY",2],["HEA",1]],ballplayer:[["DEF",0],["PAS",2],["COM",2]],fullback:[["PAC",4],["DEF",-2],["CRO",0]],sweeper:[["DEF",1],["PAC",1],["POS",2]],anchor:[["DEF",1],["PHY",2],["PAS",-2]],engine:[["PHY",2],["PAS",0],["STA",4]],box2box:[["PHY",2],["SHO",-2],["PAS",0]],playmaker:[["PAS",3],["VIS",4],["DRI",1]],creator:[["DRI",3],["PAS",2],["SHO",0]],magician:[["DRI",5],["FLA",6],["SHO",1]],poacher:[["SHO",2],["POS",4],["FIN",3]],pace:[["PAC",4],["DRI",2],["SHO",0]],power:[["SHO",1],["PHY",4],["HEA",3]],winger:[["PAC",3],["DRI",3],["CRO",2]],complete:[["SHO",2],["PAC",2],["DRI",2]]};
const clamp=(v:number)=>Math.max(42,Math.min(99,Math.round(v)));
const statsOf=(p:Player)=>(ARCH[p.ar]||ARCH.complete).map(([l,d])=>({l,v:clamp(p.ov+d)}));
const cn=(n:string)=>n.replace(/\s*\([^)]*\)/g,"").trim();
function poisson(l:number){const L=Math.exp(-l);let k=0,pr=1;do{k++;pr*=Math.random();}while(pr>L);return k-1;}
const rosterStrength=(r:Roster)=>{const s=r.players.map(p=>p.ov).sort((a,b)=>b-a).slice(0,7);return s.reduce((a,b)=>a+b,0)/s.length;};
function chemistry(placed:(Player|null)[]){let chem=0;const icons=placed.filter(p=>p&&p.ic).length;chem+=Math.min(6,icons*2);const g:Record<string,number>={};placed.forEach(p=>{if(p&&p._src){const k=p._src.club+p._src.era;g[k]=(g[k]||0)+1;}});let cl=0;Object.values(g).forEach(k=>{if(k>=2)cl+=(k-1);});chem+=Math.min(6,cl);return{chem,icons};}
function simulate(slots:Slot[],formation:string,diff:string="medium"):SimResult{const filled=slots.filter(s=>s.player);const bu:Record<Unit,number[]>={gk:[],def:[],mid:[],att:[]};filled.forEach(s=>bu[unitOf(s.role)].push(roleFit(s.player!,s.role)));const avg=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:35;const mod=FORM_MOD[formation];const gk=avg(bu.gk),def=avg(bu.def)*mod.def,mid=avg(bu.mid)*mod.mid,att=avg(bu.att)*mod.att;const{chem,icons}=chemistry(filled.map(s=>s.player));const attackWeights: Record<string, [number, number]> = {
  '4-3-3':   [0.70, 0.30],
  '4-4-2':   [0.68, 0.32],  
  '4-2-3-1': [0.65, 0.35],  
  '3-5-2':   [0.52, 0.48],  
  '5-4-1':   [0.60, 0.40],  
};
  const [aw, maw] = attackWeights[formation] ?? [0.70, 0.30];
  let attack = att * aw + mid * maw; const defenseWeights: Record<string, [number, number, number]> = {
    '4-3-3':   [0.60, 0.25, 0.15],
    '4-4-2':   [0.58, 0.24, 0.18],  
    '4-2-3-1': [0.55, 0.23, 0.22],  
    '3-5-2':   [0.58, 0.24, 0.18],  
    '5-4-1':   [0.65, 0.26, 0.09],  
  };
  const [dw, gkw, mdw] = defenseWeights[formation] ?? [0.60, 0.25, 0.15];
  let defense = def * dw + gk * gkw + mid * mdw;const _ovs=filled.map(s=>s.player!.ov);const _avgOV=_ovs.length?_ovs.reduce((a,b)=>a+b,0)/_ovs.length:70;const _quality=Math.max(0,Math.min(1,(_avgOV-83)/10));const _boost=1+(DIFF_DOM[diff]??DIFF_DOM.medium)*_quality;attack*=_boost;defense*=_boost;let W=0,D=0,Lo=0,GF=0,GA=0;const log:{gf:number;ga:number;res:string}[]=[];for(let i=0;i<38;i++){const roll = Math.random();
  const oppBase = roll < 0.15 ? 60 + Math.random() * 10 : roll < 0.70 ? 70 + Math.random() * 12 : roll < 0.92 ? 82 + Math.random() * 8 : 90 + Math.random() * 6; const oppAtk = Math.min(99, oppBase + (Math.random() * 10 - 5)); const oppDef = Math.min(99, oppBase + (Math.random() * 10 - 5));const lf = 1.5  * Math.pow(attack / oppDef, 1.7);
  const la = 1.32 * Math.pow(oppAtk / defense, 2.11) - Math.min(0.12, icons * 0.02);const gf=Math.min(7,poisson(lf)),ga=Math.min(7,poisson(la));GF+=gf;GA+=ga;let res;if(gf>ga){W++;res="W";}else if(gf===ga){D++;res="D";}else{Lo++;res="L";}log.push({gf,ga,res});}return{W,D,Lo,GF,GA,pts:W*3+D,log,chem,icons,units:{gk,def,mid,att}};}
function bestXI(pool:Player[],formation:string):Slot[]{const uniq:Record<string,Player>={};pool.forEach(p=>{if(!uniq[p.id]||p.ov>uniq[p.id].ov)uniq[p.id]=p;});const players=Object.values(uniq);const roles:Slot[]=FORMATIONS[formation].map((r,i)=>({idx:i,role:r,player:null}));const order=[...roles].sort((a,b)=>(({gk:0,att:1,def:2,mid:3} as Record<Unit,number>)[unitOf(a.role)]-({gk:0,att:1,def:2,mid:3} as Record<Unit,number>)[unitOf(b.role)]));const used=new Set<string>();order.forEach(slot=>{let best:Player|null=null,bf=-1;players.forEach(p=>{if(used.has(p.id))return;const f=roleFit(p,slot.role);if(f>bf){bf=f;best=p;}});if(best){used.add((best as Player).id);roles[slot.idx].player=best;}});return roles;}

function Badge({code,size=44}:{code:string;size?:number}){const cl=CLUBS[code];const[a,b]=cl.c;return(<svg width={size} height={size*1.18} viewBox="0 0 44 52" style={{flexShrink:0}}><defs><linearGradient id={"g"+code} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a}/><stop offset="1" stopColor={b}/></linearGradient></defs><path d="M2 4 L42 4 L42 30 Q42 44 22 50 Q2 44 2 30 Z" fill={"url(#g"+code+")"} stroke="rgba(255,255,255,.55)" strokeWidth="1.5"/><text x="22" y="27" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" style={{paintOrder:"stroke",stroke:"rgba(0,0,0,.4)",strokeWidth:2}}>{code}</text></svg>);}
function Logo({size=44}:{size?:number}){return(<svg width={size*2.6} height={size} viewBox="0 0 130 50"><defs><linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9b8cff"/><stop offset="1" stopColor="#5de0c4"/></linearGradient></defs><path d="M5 6 L41 6 L41 30 Q41 44 23 49 Q5 44 5 30 Z" fill="url(#lg1)" opacity="0.18" stroke="url(#lg1)" strokeWidth="1.5"/><circle cx="23" cy="24" r="11" fill="none" stroke="url(#lg1)" strokeWidth="1.4"/><path d="M23 13 L26.5 20.5 L18.5 20.5 Z M16 23 L19 31 L13.5 26 Z M30 23 L27 31 L32.5 26 Z" fill="url(#lg1)"/><text x="52" y="34" fontSize="30" fontWeight="900" fill="url(#lg1)" letterSpacing="-1" fontFamily="ui-sans-serif,system-ui">38-0</text></svg>);}

/* Responsive breakpoint hook — inline styles can't hold media queries, so we branch in JS. */
function useIsMobile(bp=760){
  const[m,setM]=useState(typeof window!=="undefined"?window.innerWidth<=bp:false);
  useEffect(()=>{
    const onResize=()=>setM(window.innerWidth<=bp);
    onResize();
    window.addEventListener("resize",onResize);
    return()=>window.removeEventListener("resize",onResize);
  },[bp]);
  return m;
}

export default function App(){
  const[theme,setTheme]=useState<"dark"|"light">("dark");
  const[phase,setPhase]=useState<"menu"|"play"|"results">("menu");
  const[diff,setDiff]=useState<"easy"|"medium"|"hard">("easy");
  const[showStats,setShowStats]=useState(true);
  const[soundOn,setSoundOn]=useState(true);
  useEffect(()=>{sfx.setOn(soundOn);},[soundOn]);
  useEffect(()=>{
    const h=(e:MouseEvent)=>{
      const el=(e.target as HTMLElement)?.closest?.("button,[data-sfx]") as HTMLElement|null;
      if(!el||el.hasAttribute("disabled"))return;
      sfx.resume();
      const kind=el.getAttribute("data-sfx")||"tap";
      const fn=(sfx as unknown as Record<string,()=>void>)[kind];
      if(typeof fn==="function")fn();
    };
    document.addEventListener("click",h);
    return()=>document.removeEventListener("click",h);
  },[]);
  const[formation,setFormation]=useState("4-3-3 (Balance)");
  const[formMenuOpen,setFormMenuOpen]=useState(false);
  const[slots,setSlots]=useState<Slot[]>(()=>FORMATIONS["4-3-3 (Balance)"].map((r,i)=>({idx:i,role:r,player:null})));
  const[spin,setSpin]=useState<{club:string;era:string}|null>(null);
  const[spinning,setSpinning]=useState(false);
  const[reelClub,setReelClub]=useState<string|null>(null);
  const[reelEra,setReelEra]=useState<string|null>(null);
  const[usedClub,setUsedClub]=useState(false);
  const[usedEra,setUsedEra]=useState(false);
  const[sel,setSel]=useState<Player|null>(null);
  const[moving,setMoving]=useState<Slot|null>(null);
  const[query,setQuery]=useState("");
  const[offered,setOffered]=useState<Player[]>([]);
  const[result,setResult]=useState<SimResult|null>(null);
  const[copied,setCopied]=useState(false);

  const dark=theme==="dark";
  const t=dark?{bg1:"#0a0e1a",bg2:"#1a1140",bg3:"#0d2b3e",text:"#f2f5ff",sub:"rgba(242,245,255,.6)",glass:"rgba(255,255,255,.07)",glassB:"rgba(255,255,255,.14)",chip:"rgba(255,255,255,.1)"}:{bg1:"#dfe9ff",bg2:"#f3e9ff",bg3:"#e0fbff",text:"#0d1330",sub:"rgba(13,19,48,.72)",glass:"rgba(255,255,255,.55)",glassB:"rgba(255,255,255,.7)",chip:"rgba(255,255,255,.6)"};
  const glass={background:t.glass,backdropFilter:"blur(20px) saturate(160%)",WebkitBackdropFilter:"blur(20px) saturate(160%)",border:"1px solid "+t.glassB,boxShadow:dark?"0 8px 32px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.12)":"0 8px 32px rgba(60,80,160,.18), inset 0 1px 0 rgba(255,255,255,.8)"};
  const accT=dark?"#5de0c4":"#0a7a63";const accP=dark?"#b4a8ff":"#6b4fff";
  const sc=(v:number)=>v>=86?accT:v>=81?accP:t.text;

  const filledCount=slots.filter(s=>s.player).length;
  const allFull=filledCount===11;
  const usedIds=useMemo(()=>new Set(slots.filter(s=>s.player).map(s=>s.player!.id)),[slots]);
  const CLUB_ERAS=useMemo(()=>{const m:Record<string,string[]>={};ROSTERS.forEach(r=>{(m[r.club]=m[r.club]||[]).push(r.era);});return m;},[]);
  const rosterOf=(c:string,e:string)=>ROSTERS.find(r=>r.club===c&&r.era===e);
  const squadPower=useMemo(()=>{const pl=slots.filter(s=>s.player).map(s=>s.player!);if(!pl.length)return 0;return pl.reduce((a,p)=>a+p.ov,0)/pl.length+pl.filter(p=>p.ic).length*1.5;},[slots]);

  const clubBest=(c:string)=>Math.max(...CLUB_ERAS[c].map(e=>rosterStrength(rosterOf(c,e)!)));
  const clubHasIcon=(c:string)=>CLUB_ERAS[c].some(e=>rosterOf(c,e)!.players.some(p=>p.ic));
  const eraHasIcon=(c:string,e:string)=>rosterOf(c,e)!.players.some(p=>p.ic);
  const spinWeight=(B:number,hasIcon:boolean,pf:number,cfg:{pfScale:number;strBias:number;iconMult:number;floor:number})=>{
    const sn=Math.max(0,Math.min(1,(B-81)/8));
    const rubber=1/(1+pf*cfg.pfScale*Math.max(0,(B-74)/7));
    const skew=cfg.strBias>=0?Math.pow(0.18+sn,cfg.strBias):Math.pow(0.18+(1-sn),-cfg.strBias);
    return rubber*skew*(hasIcon?cfg.iconMult:1);
  };
  const pickWeighted=(items:string[],raw:number[],floor:number)=>{const tot=raw.reduce((a,b)=>a+b,0)||1;const u=1/items.length;const w=raw.map(x=>(1-floor)*(x/tot)+floor*u);const wt=w.reduce((a,b)=>a+b,0);let r=Math.random()*wt;for(let i=0;i<items.length;i++){r-=w[i];if(r<=0)return items[i];}return items[0];};
  function wClub(){const cfg=DIFF_SPIN[diff]||DIFF_SPIN.medium;const pf=Math.max(0,(squadPower-84)/10);const cs=Object.keys(CLUB_ERAS);const raw=cs.map(c=>spinWeight(clubBest(c),clubHasIcon(c),pf,cfg));return pickWeighted(cs,raw,cfg.floor);}
  function wEra(club:string,ex?:string){const cfg=DIFF_SPIN[diff]||DIFF_SPIN.medium;const pf=Math.max(0,(squadPower-84)/10);const es=CLUB_ERAS[club].filter(e=>e!==ex);const pool=es.length?es:CLUB_ERAS[club];const raw=pool.map(e=>spinWeight(rosterStrength(rosterOf(club,e)!),eraHasIcon(club,e),pf,cfg));return pickWeighted(pool,raw,cfg.floor);}

  function start(){setPhase("play");setSlots(FORMATIONS[formation].map((r,i)=>({idx:i,role:r,player:null})));setSpin(null);setSpinning(false);setReelClub(null);setReelEra(null);setUsedClub(false);setUsedEra(false);setSel(null);setMoving(null);setResult(null);setOffered([]);setQuery("");}

  function revealRoster(club: string, era: string, attempt = 0) {
    const r = rosterOf(club, era);
    if (!r) return;
  
    const emptySlots = slots.filter(s => !s.player);
  
    if (emptySlots.length <= 3 && emptySlots.length > 0 && attempt < 20) {
      const emptyRoles = emptySlots.map(s => s.role);
      const newPlayers = r.players.map(p => ({ ...p, src: { club, era } }));
      const anyPlaceable = newPlayers.some(p =>
        emptyRoles.some(role => fitClass(p, role) !== null)
      );
      
      if (!anyPlaceable) {
        const newClub = wClub();
        const newEra = wEra(newClub);
        revealRoster(newClub, newEra, attempt + 1);
        return;
      }
    }
    
    setSpin({ club, era });
    setSpinning(false);
    setOffered(o => {
      const seen = new Set(o.map(p => `${p.id}${p.ov}`));
      const add = r.players.filter(p => !seen.has(`${p.id}${p.ov}`) && p.ov);
      return [...o, ...add.map(p => ({ ...p, src: { club, era } }))];
    });
  }
  function spin1(){ // single spin: club + era together
    if(spinning||allFull)return;
    setSel(null);setMoving(null);setSpin(null);setSpinning(true);
    const ck=Object.keys(CLUBS);let n=0;const total=16+Math.floor(Math.random()*6);
    const iv=setInterval(()=>{const rc=ck[Math.floor(Math.random()*ck.length)];setReelClub(rc);setReelEra(CLUB_ERAS[rc][Math.floor(Math.random()*CLUB_ERAS[rc].length)]);sfx.reel();n++;if(n>=total){clearInterval(iv);const c=wClub();const e=wEra(c);setReelClub(c);setReelEra(e);sfx.lock();setTimeout(()=>revealRoster(c,e),120);}},65);
  }
  function changeClub(){
    if(usedClub||!spin||spinning)return;
    const opts=Object.keys(CLUB_ERAS).filter(c=>c!==spin.club&&CLUB_ERAS[c].includes(spin.era));
    if(!opts.length)return;setUsedClub(true);setSel(null);setSpin(null);setSpinning(true);
    let n=0;const iv=setInterval(()=>{setReelClub(opts[Math.floor(Math.random()*opts.length)]);sfx.reel();n++;if(n>=12){clearInterval(iv);const c=opts[Math.floor(Math.random()*opts.length)];setReelClub(c);sfx.lock();setTimeout(()=>revealRoster(c,reelEra??spin.era),100);}},65);
  }
  function changeEra(){
    if(usedEra||!spin||spinning)return;
    const opts=CLUB_ERAS[spin.club].filter(e=>e!==spin.era);
    if(!opts.length)return;setUsedEra(true);setSel(null);const club=spin.club;setSpin(null);setSpinning(true);
    let n=0;const iv=setInterval(()=>{setReelEra(opts[Math.floor(Math.random()*opts.length)]);sfx.reel();n++;if(n>=12){clearInterval(iv);const e=opts[Math.floor(Math.random()*opts.length)];setReelEra(e);sfx.lock();setTimeout(()=>revealRoster(club,e),100);}},65);
  }

  function selectPlayer(p:Player){if(usedIds.has(p.id))return;setMoving(null);setSel(sel&&sel.id===p.id?null:p);}
  function placeInSlot(slot:Slot){
    if(moving){
      if(slot.idx===moving.idx){setMoving(null);return;}
      if(!slot.player){ if(fitClass(moving.player,slot.role)){setSlots(s=>s.map(sl=>sl.idx===slot.idx?{...sl,player:moving.player}:sl.idx===moving.idx?{...sl,player:null}:sl));setMoving(null);sfx.place();} return;}
      if(fitClass(moving.player,slot.role)&&fitClass(slot.player,moving.role)){setSlots(s=>s.map(sl=>sl.idx===slot.idx?{...sl,player:moving.player}:sl.idx===moving.idx?{...sl,player:slot.player}:sl));setMoving(null);sfx.place();}
      return;
    }
    if(!sel)return;
    if(slot.player||!fitClass(sel,slot.role))return;
    const src=spin?{club:spin.club,era:spin.era}:sel._src;
    setSlots(s=>s.map(sl=>sl.idx===slot.idx?{...sl,player:{...sel,_src:src}}:sl));
    sfx.place();
    setSel(null);setSpin(null);setReelClub(null);setReelEra(null);setQuery(""); // <-- clears the spin so the Spin button returns
  }
  function changeFormation(nf:string){
    setFormation(nf);const roles=FORMATIONS[nf];const players=slots.filter(s=>s.player).map(s=>s.player!);const ns:Slot[]=roles.map((r,i)=>({idx:i,role:r,player:null}));
    players.forEach(pl=>{let done=false;for(const s of ns)if(!s.player&&pl.b.includes(s.role)){s.player=pl;done=true;break;}if(!done)for(const s of ns)if(!s.player&&pl.o.includes(s.role)){s.player=pl;done=true;break;}if(!done)for(const s of ns)if(!s.player&&pl.b.concat(pl.o).some(r=>unitOf(r)===unitOf(s.role))){s.player=pl;done=true;break;}});
    setSlots(ns);setSel(null);setMoving(null);
  }
  function runSeason(){const r=simulate(slots,formation,diff);setResult(r);setPhase("results");setTimeout(()=>{if(r.W===38)sfx.fanfare();else if(r.Lo===0||r.pts>=90)sfx.success();else sfx.thud();},140);}
  const oracle=useMemo(()=>{if(phase!=="results"||offered.length<11)return null;const xi=bestXI(offered,formation);if(xi.some(s=>!s.player))return null;return simulate(xi,formation,diff);},[phase,offered,formation,diff]);

  function verdict(r:SimResult){if(r.W===38)return{title:"THE IMPOSSIBLE SEASON",sub:"38-0. The greatest team ever assembled.",tier:"legend"};if(r.Lo===0&&r.D<=4)return{title:"INVINCIBLES",sub:"Unbeaten — but the perfect record slipped away.",tier:"gold"};if(r.pts>=90)return{title:"CHAMPIONS",sub:"A dominant, title-winning campaign.",tier:"gold"};if(r.pts>=75)return{title:"TITLE CHALLENGERS",sub:"So close. Rebalance and run it back.",tier:"silver"};if(r.pts>=55)return{title:"EUROPEAN NIGHTS",sub:"Solid — but not invincible.",tier:"silver"};return{title:"REBUILDING",sub:"The squad needs balance across the pitch.",tier:"bronze"};}
  function share(){if(!result)return;const v=verdict(result);const xi=slots.map(s=>s.role+": "+(s.player?cn(s.player.n):"—")).join("\n");const txt="⚽ 38-0 — "+v.title+"\n"+result.W+"-"+result.D+"-"+result.Lo+" · "+result.pts+" pts · GF "+result.GF+"/GA "+result.GA+" · "+formation+"\n\n"+xi+"\n\nChase the impossible 38-0.";if(navigator.clipboard)navigator.clipboard.writeText(txt).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1800);});}
  // Compute which roles still have empty slots
  const openRoles = useMemo(() =>
    new Set(slots.filter(s => !s.player).map(s => s.role)),
  [slots]);
    
  // A player is "placeable" if they can fit at least one open role
  const isPlaceable = (pl: Player): boolean => {
    for (const role of Array.from(openRoles)) {
      if (fitClass(pl, role) !== null) return true;
      } 
    return false;
  };  
  const formationRows=FORMATION_ROWS[formation]||[1,4,3,3];
  let _ri=0;
  const slotRows:Slot[][]=formationRows.map(n=>{const g=slots.slice(_ri,_ri+n);_ri+=n;return g;});
  const allForms=Object.keys(FORMATIONS);
  const forms433=allForms.filter(f=>f.startsWith("4-3-3"));
  const formsOther=allForms.filter(f=>!f.startsWith("4-3-3"));
  const variantOf=(f:string)=>f.match(/\(([^)]+)\)/)?.[1]||f;
  const is433=formation.startsWith("4-3-3");
  const mob=useIsMobile(760);
  const roster=spin?rosterOf(spin.club,spin.era):null;
  const filteredPlayers=roster?roster.players.filter(p=>cn(p.n).toLowerCase().includes(query.toLowerCase())):[];
  const highlight=sel||(moving&&moving.player);
  const v=phase==="results"&&result?verdict(result):null;
  const TIER_BG:Record<string,string>={legend:"linear-gradient(135deg,#ffd86b,#ff8c6b,#ff5d8f)",gold:"linear-gradient(135deg,#ffd86b,#f7a93b)",silver:"linear-gradient(135deg,#cfd8ff,#9bb0d8)",bronze:"linear-gradient(135deg,#d9a877,#a9784f)"};
  const tc=v?TIER_BG[v.tier]:"";

  return(
  <div style={{minHeight:"100vh",width:"100%",color:t.text,fontFamily:"ui-sans-serif, system-ui, sans-serif",position:"relative",overflow:"hidden"}}>
    <div style={{position:"fixed",inset:0,zIndex:0,background:"radial-gradient(circle at 15% 20%, "+t.bg2+", transparent 55%), radial-gradient(circle at 85% 15%, "+t.bg3+", transparent 50%), radial-gradient(circle at 50% 90%, "+t.bg2+", transparent 60%), "+t.bg1}}/>
    <div style={{position:"fixed",top:"-10%",left:"-5%",width:480,height:480,borderRadius:"50%",background:t.bg3,filter:"blur(120px)",opacity:dark?.5:.6,zIndex:0}}/>
    <div style={{position:"fixed",bottom:"-15%",right:"-8%",width:520,height:520,borderRadius:"50%",background:t.bg2,filter:"blur(130px)",opacity:dark?.45:.55,zIndex:0}}/>
    <div style={{position:"relative",zIndex:1,maxWidth:1100,margin:"0 auto",padding:"18px 16px 60px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
        <Logo size={42}/>
        <div style={{display:"flex",gap:8}}>
          {phase!=="menu"&&<button onClick={()=>setPhase("menu")} style={{...glass,borderRadius:14,padding:"9px 14px",color:t.text,fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><RefreshCw size={15}/> New game</button>}
          <button onClick={()=>{const v=!soundOn;setSoundOn(v);sfx.setOn(v);}} title={soundOn?"Mute sounds":"Unmute sounds"} style={{...glass,borderRadius:14,padding:10,color:t.text,cursor:"pointer",display:"flex"}}>{soundOn?<Volume2 size={17}/>:<VolumeX size={17}/>}</button>
          <button onClick={()=>setTheme(dark?"light":"dark")} style={{...glass,borderRadius:14,padding:10,color:t.text,cursor:"pointer",display:"flex"}}>{dark?<Sun size={17}/>:<Moon size={17}/>}</button>
        </div>
      </div>

      {phase==="menu"&&(
      <div style={{...glass,borderRadius:28,padding:"34px 26px",maxWidth:640,margin:"20px auto 0",textAlign:"center"}}>
        <Sparkles size={30} style={{color:accP,marginBottom:8}}/>
        <h1 style={{ fontSize: 29, fontWeight: 900, margin: '0 0 8px', color: dark ? '#F2F5FF' : t.text }}>Can you go unbeaten?</h1>
        <p style={{color:t.sub,fontSize:14.5,lineHeight:1.6,margin:"0 0 24px"}}>Spin a club & era, pick one player into your XI, and build a balanced, high-chemistry side. Simulate 38 games and chase <b style={{color:t.text}}>38 wins, 0 defeats.</b></p>
        <div style={{display:"grid",gap:13,textAlign:"left",marginBottom:22}}>
          <div style={{...glass,borderRadius:16,padding:"14px 16px",boxShadow:"none"}}><div style={{fontWeight:700,fontSize:14,marginBottom:10}}>Difficulty (locked for the game)</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{DIFFS.map(d=><button key={d.id} onClick={()=>setDiff(d.id)} style={{flex:"1 1 0",minWidth:96,borderRadius:11,padding:"9px 10px",fontSize:13,fontWeight:800,cursor:"pointer",border:diff===d.id?"1.5px solid #9b8cff":"1px solid "+t.glassB,background:diff===d.id?"rgba(155,140,255,.22)":t.chip,color:t.text,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><span style={{fontSize:15}}>{d.emoji}</span>{d.label}</button>)}</div><div style={{color:t.sub,fontSize:12.5,marginTop:9}}>{DIFFS.find(d=>d.id===diff)?.desc}</div></div>
          <div style={{...glass,borderRadius:16,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"none"}}><div><div style={{fontWeight:700,fontSize:14}}>Player stats</div><div style={{color:t.sub,fontSize:12.5}}>{showStats?"Overalls & stats visible.":"Overalls & stats hidden — pick on names alone."}</div></div><button onClick={()=>setShowStats(s=>!s)} style={{background:showStats?"linear-gradient(135deg,#5de0c4,#3aa0ff)":t.chip,border:showStats?"none":"1px solid "+t.glassB,borderRadius:12,padding:"9px 14px",color:showStats?"#06121f":t.text,fontWeight:800,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>{showStats?<Eye size={15}/>:<EyeOff size={15}/>}{showStats?"Shown":"Hidden"}</button></div>
          <div style={{...glass,borderRadius:16,padding:"14px 16px",boxShadow:"none"}}><div style={{fontWeight:700,fontSize:14,marginBottom:10}}>Starting formation</div><div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            <div style={{position:"relative"}}>
              <button onClick={()=>setFormMenuOpen(o=>!o)} style={{borderRadius:11,padding:"8px 13px",fontSize:13,fontWeight:700,cursor:"pointer",border:is433?"1.5px solid #9b8cff":"1px solid "+t.glassB,background:is433?"rgba(155,140,255,.22)":t.chip,color:t.text,display:"flex",alignItems:"center",gap:6}}>4-3-3{is433?" · "+variantOf(formation):""}<ChevronDown size={14} style={{transform:formMenuOpen?"rotate(180deg)":"none",transition:"transform .15s"}}/></button>
              {formMenuOpen&&<>
                <div onClick={()=>setFormMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:30}}/>
                <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:31,minWidth:172,background:dark?"#161a2e":"#ffffff",border:"1px solid "+t.glassB,borderRadius:12,padding:6,boxShadow:"0 14px 32px rgba(0,0,0,.4)",display:"grid",gap:3}}>
                  {forms433.map(f=><button key={f} onClick={()=>{setFormation(f);setFormMenuOpen(false);}} style={{textAlign:"left",borderRadius:8,padding:"9px 11px",fontSize:13,fontWeight:700,cursor:"pointer",border:"none",background:formation===f?"rgba(155,140,255,.22)":"transparent",color:t.text,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>{variantOf(f)}{formation===f&&<Check size={14} style={{color:accP}}/>}</button>)}
                </div>
              </>}
            </div>
            {formsOther.map(f=><button key={f} onClick={()=>setFormation(f)} style={{borderRadius:11,padding:"8px 13px",fontSize:13,fontWeight:700,cursor:"pointer",border:formation===f?"1.5px solid #9b8cff":"1px solid "+t.glassB,background:formation===f?"rgba(155,140,255,.22)":t.chip,color:t.text}}>{f}</button>)}
          </div></div>
        </div>
        <button onClick={start} data-sfx="select" style={{width:"100%",background:"linear-gradient(135deg,#9b8cff,#5de0c4)",border:"none",borderRadius:16,padding:16,color:"#06121f",fontWeight:900,fontSize:17,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 8px 24px rgba(155,140,255,.35)"}}><Play size={19}/> Start the chase</button>
        <p style={{color:t.sub,fontSize:11,marginTop:14,lineHeight:1.5}}>118 squads across 5 leagues & 5 eras · 8 game-winning icons (incl. Maradona & Lewandowski). Representative stats; stylised crests.</p>
      </div>)}

      {phase==="play"&&(
      <div style={{display:"grid",gap:14}}>
        <div style={{...glass,borderRadius:18,padding:"12px 16px",display:"flex",flexWrap:"wrap",gap:12,alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}><span style={{fontSize:12.5,color:t.sub}}>Formation</span><select value={formation} onChange={e=>changeFormation(e.target.value)} style={{background:t.chip,color:t.text,border:"1px solid "+t.glassB,borderRadius:10,padding:"7px 10px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{Object.keys(FORMATIONS).map(f=><option key={f} value={f} style={{color:"#000"}}>{f}</option>)}</select><span style={{fontSize:12,color:t.sub,padding:"4px 10px",borderRadius:8,background:t.chip,display:"inline-flex",alignItems:"center",gap:5}}>{DIFFS.find(d=>d.id===diff)?.emoji} {DIFFS.find(d=>d.id===diff)?.label}</span><button onClick={()=>setShowStats(s=>!s)} title="Toggle overalls & stats" style={{fontSize:12,fontWeight:700,color:t.text,padding:"4px 10px",borderRadius:8,background:t.chip,border:"1px solid "+t.glassB,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:5}}>{showStats?<Eye size={13}/>:<EyeOff size={13}/>}{showStats?"Stats":"Hidden"}</button></div>
          <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{fontSize:13,fontWeight:800}}>{filledCount}<span style={{color:t.sub,fontWeight:600}}>/11</span></div>{allFull&&<button onClick={runSeason} data-sfx="select" style={{background:"linear-gradient(135deg,#5de0c4,#3aa0ff)",border:"none",borderRadius:12,padding:"10px 16px",color:"#06121f",fontWeight:900,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:6,boxShadow:"0 6px 18px rgba(93,224,196,.35)"}}><Trophy size={16}/> Simulate season</button>}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"minmax(0,1.15fr) minmax(0,1fr)",gap:14,alignItems:"start"}}>
          {/* PITCH */}
          <div style={{...glass,borderRadius:24,padding:"16px 10px",minHeight:470,position:"relative",background:dark?"linear-gradient(160deg, rgba(30,80,60,.3), rgba(255,255,255,.05))":"linear-gradient(160deg, rgba(140,210,170,.35), rgba(255,255,255,.5))"}}>
            <div style={{position:"absolute",top:"50%",left:10,right:10,height:1,background:t.glassB}}/>
            <div style={{position:"absolute",top:"50%",left:"50%",width:56,height:56,border:"1px solid "+t.glassB,borderRadius:"50%",transform:"translate(-50%,-50%)"}}/>
            {highlight&&<div style={{position:"absolute",top: 'auto', bottom: 8, left: 0, right: 0, textAlign: 'center', fontSize: 11.5, fontWeight: 700, color:accT}}>{moving?"Tap a glowing slot to move/swap ":"Tap a glowing slot to place "}{cn(highlight.n).split(" ").pop()}</div>}
            {slotRows.map((group,ri)=>(
            <div key={ri} style={{display:"flex",justifyContent:"center",gap:mob?4:6,margin:"13px 0",flexWrap:"nowrap"}}>
              {group.map(s=>{
                let ring=null;
                if(highlight&&!s.player){const fc=fitClass(highlight,s.role);ring=fc==="best"?"#5de0c4":fc==="ok"?"#ffd86b":fc === 'cross'? '#ff9f43':fc==="unit"?"#9b8cff":null;}
                else if(moving&&s.player&&s.idx!==moving.idx&&fitClass(moving.player,s.role)&&fitClass(s.player,moving.role)){ring="#c08cff";}
                return(
                <div key={s.idx} onClick={()=>placeInSlot(s)} style={{flex:"1 1 0",minWidth:0,maxWidth:74,minHeight:74,borderRadius:13,cursor:"pointer",padding:"6px 4px",textAlign:"center",overflow:"hidden",border:ring?"2px solid "+ring:"1.5px "+(s.player?"solid":"dashed")+" "+t.glassB,background:s.player?(dark?"rgba(255,255,255,.1)":"rgba(255,255,255,.72)"):ring?ring+"22":"transparent",boxShadow:ring?"0 0 14px "+ring+"66":"none",transition:"all .15s"}}>
                  <div style={{fontSize:9.5,fontWeight:800,color:t.sub}}>{s.role}</div>
                  {s.player?(<>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:2,marginTop:2}}><div style={{fontSize:11,fontWeight:800,lineHeight:1.05,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cn(s.player.n).split(" ").slice(-1)[0]}</div></div>
                    {showStats&&<div style={{fontSize:12.5,fontWeight:900,color:s.player.ov>=88?accT:t.text,marginTop:1}}>{s.player.ov}</div>}
                    <button onClick={e=>{e.stopPropagation();setSel(null);setMoving(moving&&moving.idx===s.idx?null:{idx:s.idx,role:s.role,player:s.player});}} style={{marginTop:2,background:moving&&moving.idx===s.idx?"#c08cff":t.chip,border:"1px solid "+t.glassB,borderRadius:6,padding:"1px 5px",cursor:"pointer",color:moving&&moving.idx===s.idx?"#06121f":t.text,display:"inline-flex",alignItems:"center",gap:2,fontSize:9,fontWeight:700}}><ArrowLeftRight size={9}/> move</button>
                  </>):<div style={{fontSize:20,color:ring||t.sub,marginTop:11,fontWeight:300}}>+</div>}
                </div>);
              })}
            </div>))}
          </div>
          {/* SPIN PANEL */}
          <div style={{...glass,borderRadius:22,padding:16}}>
            <div style={{display:"flex",gap:10,marginBottom:12}}>
              <div style={{flex:1,...glass,boxShadow:"none",borderRadius:16,padding:"14px 8px",textAlign:"center",minHeight:96,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <div style={{fontSize:10,fontWeight:800,color:t.sub,letterSpacing:1,marginBottom:6}}>CLUB</div>
                {(reelClub||spin)?<><Badge code={spin?spin.club:reelClub!} size={34}/><div style={{fontSize:12.5,fontWeight:800,marginTop:5}}>{CLUBS[spin?spin.club:reelClub!].name}</div></>:<div style={{fontSize:26,color:t.sub}}>?</div>}
              </div>
              <div style={{flex:1,...glass,boxShadow:"none",borderRadius:16,padding:"14px 8px",textAlign:"center",minHeight:96,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <div style={{fontSize:10,fontWeight:800,color:t.sub,letterSpacing:1,marginBottom:6}}>ERA</div>
                {(reelEra||spin)?<div style={{fontSize:30,fontWeight:900,background:"linear-gradient(135deg,#9b8cff,#5de0c4)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{spin?spin.era:reelEra}</div>:<div style={{fontSize:26,color:t.sub}}>?</div>}
              </div>
            </div>
            {!spin&&<button onClick={spin1} disabled={spinning||allFull} style={{width:"100%",background:spinning||allFull?t.chip:"linear-gradient(135deg,#9b8cff,#5de0c4)",border:"none",borderRadius:14,padding:14,color:spinning||allFull?t.sub:"#06121f",fontWeight:900,fontSize:15,cursor:spinning||allFull?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Shuffle size={17} className={spinning?"spin":""}/> {allFull?"Squad complete":spinning?"Spinning…":"Spin"}</button>}
            {spin&&(<>
              <div style={{fontSize:11.5,color:accP,fontWeight:700,fontStyle:"italic",textAlign:"center",margin:"2px 0 8px"}}>{roster?.note} · {CLUBS[spin.club].league}</div>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <button onClick={changeClub} disabled={usedClub} style={{flex:1,background:usedClub?t.chip:"rgba(155,140,255,.18)",border:"1px solid "+(usedClub?t.glassB:"rgba(155,140,255,.5)"),borderRadius:11,padding:8,color:usedClub?t.sub:t.text,fontSize:11.5,fontWeight:700,cursor:usedClub?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}><Repeat size={13}/> {usedClub?"Club used":"Re-spin club"}</button>
                <button onClick={changeEra} disabled={usedEra} style={{flex:1,background:usedEra?t.chip:"rgba(93,224,196,.16)",border:"1px solid "+(usedEra?t.glassB:"rgba(93,224,196,.5)"),borderRadius:11,padding:8,color:usedEra?t.sub:t.text,fontSize:11.5,fontWeight:700,cursor:usedEra?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}><Clock size={13}/> {usedEra?"Era used":"Re-spin era"}</button>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,...glass,boxShadow:"none",borderRadius:10,padding:"6px 10px",marginBottom:8}}><Search size={14} style={{color:t.sub}}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search players…" style={{flex:1,background:"transparent",border:"none",outline:"none",color:t.text,fontSize:13}}/></div>
              <div style={{display:"grid",gap:6,maxHeight:300,overflowY:"auto"}}>
                {filteredPlayers.map((pl,i)=>{const taken=usedIds.has(pl.id); const noSlot = !taken && !isPlaceable(pl); const isSel=sel&&sel.id===pl.id;return(
                  <div key={i} onClick={()=>!taken&& !noSlot && selectPlayer(pl)} style={{...glass,boxShadow:isSel?"0 0 0 1.5px #9b8cff":"none",borderRadius:11,padding:"8px 10px",cursor: taken || noSlot ? 'default' : 'pointer',
                    opacity: taken ? 0.38 : noSlot ? 0.45 : 1,   
                    display: 'flex', alignItems: 'center', gap: 8
                  }}
                  >
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:800,fontSize:13,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{cn(pl.n)}{taken&&<span style={{color:accT,fontSize:10}}>· in squad</span>}</div>
                    <div style={{display:"flex",gap:3,marginTop:3,flexWrap:"wrap"}}>{pl.b.map(r=><span key={r} style={{fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:5,background:"rgba(93,224,196,.2)",color:dark?"#5de0c4":"#0a7a63"}}>{r}</span>)}{pl.o.map(r=><span key={r} style={{fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:5,background:t.chip,color:t.sub}}>{r}</span>)}</div>
                  </div>
                  {showStats&&<div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{display:"flex",gap:6}}>{statsOf(pl).map(st=><div key={st.l} style={{textAlign:"center",minWidth:26}}><div style={{fontWeight:800,fontSize:12,color:sc(st.v)}}>{st.v}</div><div style={{fontSize:8,color:t.sub,fontWeight:700}}>{st.l}</div></div>)}</div>
                    <div style={{
                      width: 42, height: 48, borderRadius: 10,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      background: pl.ov >= 90 ? 'linear-gradient(135deg,#ffd86b,#ff8c6b)' : pl.ov >= 84 ? 'linear-gradient(135deg,#9b8cff,#5de0c4)' : t.chip,
                      color: pl.ov >= 84 ? '#06121f' : t.text,
                      gap: 1,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.18)'
                    }}>
                      <div style={{ fontWeight: 900, fontSize: 17, lineHeight: 1 }}>{pl.ov}</div>
                      <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.5, opacity: 0.75 }}>OVR</div></div>
                  </div>}
                </div>);})}
                {!filteredPlayers.length&&<div style={{color:t.sub,fontSize:12,textAlign:"center",padding:10}}>No players match.</div>}
              </div>
            </>)}
          </div>
        </div>
      </div>)}

      {phase==="results"&&result&&v&&(
      <div style={{maxWidth:720,margin:"0 auto",display:"grid",gap:14}}>
        <div style={{...glass,borderRadius:26,padding:"30px 22px",textAlign:"center",position:"relative",overflow:"hidden"}}>
          {v.tier==="legend"&&<div style={{position:"absolute",inset:0,background:"radial-gradient(circle at 50% 0%, rgba(255,216,107,.25), transparent 60%)"}}/>}
          <Trophy size={38} style={{marginBottom:8,color:"#ffd86b",position:"relative"}}/>
          <div style={{fontSize:27,fontWeight:900,background:tc,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",position:"relative"}}>{v.title}</div>
          <p style={{color:t.sub,fontSize:14,margin:"8px 0 20px",position:"relative"}}>{v.sub}</p>
          <div style={{display:"flex",justifyContent:"center",gap:10,flexWrap:"wrap",position:"relative"}}>{[["Record",result.W+"-"+result.D+"-"+result.Lo],["Points",result.pts],["Scored",result.GF],["Conceded",result.GA],["Chemistry",Math.round(result.chem)],["Icons",result.icons]].map(([l,val])=><div key={l} style={{...glass,boxShadow:"none",borderRadius:14,padding:"11px 15px",minWidth:78}}><div style={{fontSize:21,fontWeight:900}}>{val}</div><div style={{fontSize:10,color:t.sub,fontWeight:700,textTransform:"uppercase"}}>{l}</div></div>)}</div>
        </div>
        {oracle&&<div style={{...glass,borderRadius:16,padding:"12px 16px",display:"flex",alignItems:"center",gap:10,fontSize:12.5,color:t.sub}}><Wand2 size={15} style={{color:accP}}/> The Oracle's best possible XI from your spins would have projected <b style={{color:t.text}}>{oracle.W}-{oracle.D}-{oracle.Lo}</b> ({oracle.pts} pts). You scored <b style={{color:t.text}}>{result.pts}</b>.</div>}
        <div style={{...glass,borderRadius:20,padding:"16px 18px"}}>
          <div style={{fontSize:12.5,fontWeight:800,color:t.sub,marginBottom:10}}>SEASON FORM (38 GAMES)</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{result.log.map((m,i)=><div key={i} title={m.gf+"-"+m.ga} style={{width:22,height:22,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#06121f",background:m.res==="W"?"#5de0c4":m.res==="D"?"#ffd86b":"#ff5d8f"}}>{m.res}</div>)}</div>
          <div style={{display:"flex",gap:14,marginTop:14}}>{([["Attack",result.units.att],["Midfield",result.units.mid],["Defence",result.units.def],["Keeper",result.units.gk]] as [string,number][]).map(([l,val])=>{const pct=Math.max(5,Math.min(100,Math.round(val/95*100)));return<div key={l} style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11.5,color:t.sub,marginBottom:4}}><span>{l}</span><span style={{fontWeight:800,color:t.text}}>{Math.round(val)}</span></div><div style={{height:5,borderRadius:4,background:t.chip,overflow:"hidden"}}><div style={{width:pct+"%",height:"100%",background:pct>80?"#5de0c4":pct>62?"#9b8cff":"#ff8c6b"}}/></div></div>;})}</div>
        </div>
        <div style={{...glass,borderRadius:20,padding:"16px 18px"}}>
          <div style={{fontSize:12.5,fontWeight:800,color:t.sub,marginBottom:10}}>YOUR XI · {formation}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>{slots.map(s=><div key={s.idx} style={{...glass,boxShadow:"none",borderRadius:11,padding:"8px 10px", textAlign: 'center'}}><span style={{fontSize:9.5,fontWeight:800,color:t.sub}}>{s.role}</span><div style={{fontSize:12.5,fontWeight:700,display:"flex",alignItems:"center", justifyContent: "center",gap:4}}>{s.player?cn(s.player.n):"—"}</div></div>)}</div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={start} style={{flex:1,...glass,borderRadius:15,padding:14,color:t.text,fontWeight:800,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}><RefreshCw size={17}/> New game</button>
          <button onClick={share} data-sfx="select" style={{flex:1,background:"linear-gradient(135deg,#9b8cff,#5de0c4)",border:"none",borderRadius:15,padding:14,color:"#06121f",fontWeight:900,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}><Share2 size={17}/> {copied?"Copied!":"Share"}</button>
        </div>
      </div>)}
    </div>
    <style>{"@keyframes spin360{to{transform:rotate(360deg)}}.spin{animation:spin360 .7s linear infinite}::-webkit-scrollbar{width:7px}::-webkit-scrollbar-thumb{background:"+t.glassB+";border-radius:10px}select option{color:#000}button{font-family:inherit;transition:transform .1s,filter .15s}button:active:not(:disabled){transform:scale(.97)}input::placeholder{color:"+t.sub+"}"}</style>
    <footer style={{
      textAlign: 'center',
      padding: '18px 16px 20px',
      marginTop: 8,
      borderTop: `1px solid ${t.glassB}`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 10,
    }}>
    
      {/* Name + Links Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
    
        <span style={{ fontSize: 13, fontWeight: 800, color: t.text, letterSpacing: 0.3 }}>
          Matin Saffar
        </span>
    
        {/* GitHub */}
        <a href="https://github.com/matinsaffar" target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 5, color: t.sub, fontSize: 12, textDecoration: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.color = t.text)}
          onMouseLeave={e => (e.currentTarget.style.color = t.sub)}>
          <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{flexShrink:0,display:"block"}}>
            <path fill={dark?"#f2f5ff":"#0d1330"} d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
          </svg>
          GitHub
        </a>
    
        {/* Gmail */}
        <a href="mailto:mattsaffar@gmail.com"
          style={{ display: 'flex', alignItems: 'center', gap: 5, color: t.sub, fontSize: 12, textDecoration: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.color = t.text)}
          onMouseLeave={e => (e.currentTarget.style.color = t.sub)}>
          <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{flexShrink:0,display:"block"}}>
            <path fill="#EA4335" d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
          </svg>
          mattsaffar@gmail.com
        </a>
    
        {/* LinkedIn */}
        <a href="https://www.linkedin.com/in/matin-saffar?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=ios_app"
          target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 5, color: t.sub, fontSize: 12, textDecoration: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.color = t.text)}
          onMouseLeave={e => (e.currentTarget.style.color = t.sub)}>
          <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{flexShrink:0,display:"block"}}>
            <rect width="24" height="24" rx="4" fill="#0A66C2"/>
            <path fill="#ffffff" d="M7.75 9.5h-2.5v8h2.5v-8zm-1.25-4a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm9 4c-1.2 0-2 .6-2.3 1.2V9.5h-2.5v8h2.5v-4.2c0-1.1.6-1.8 1.6-1.8.9 0 1.4.6 1.4 1.8v4.2h2.5v-4.8c0-2.3-1.3-3.2-3.2-3.2z"/>
          </svg>
          LinkedIn
        </a>
      </div>
    
      {/* Copyright */}
      <div style={{ fontSize: 11, color: t.sub, opacity: 0.6 }}>
        © {new Date().getFullYear()} Matin Saffar · All rights reserved
      </div>
    
    </footer>
  </div>);
}
    