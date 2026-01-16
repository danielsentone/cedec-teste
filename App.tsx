
import React, { useState, useEffect, useRef } from 'react';
import { Laudo, Tipologia, ClassificacaoDanos, Engenheiro } from './types';
import { MUNICIPIOS_PR, DANOS_LIST } from './constants';

const App: React.FC = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [laudosCount, setLaudosCount] = useState<number>(() => {
    const saved = localStorage.getItem('laudosCount');
    return saved ? parseInt(saved) : 1;
  });

  const [engenheiros, setEngenheiros] = useState<Engenheiro[]>(() => {
    const saved = localStorage.getItem('engenheiros');
    return saved ? JSON.parse(saved) : [
      { nome: "Daniel", crea: "PR-123456", endereco: "Curitiba", telefone: "41 99999-9991" },
      { nome: "Débora", crea: "PR-234567", endereco: "Londrina", telefone: "43 99999-9992" },
      { nome: "Lorena", crea: "PR-345678", endereco: "Maringá", telefone: "44 99999-9993" },
      { nome: "Tainara", crea: "PR-456789", endereco: "Cascavel", telefone: "45 99999-9994" }
    ];
  });

  const [showEngenheiroModal, setShowEngenheiroModal] = useState(false);
  const [newEng, setNewEng] = useState<Engenheiro>({ nome: '', crea: '', endereco: '', telefone: '' });

  const [formData, setFormData] = useState<Partial<Laudo>>({
    id: laudosCount,
    data: new Date().toLocaleDateString('pt-BR'),
    municipio: "Rio Bonito do Iguaçu",
    engenheiro: 'Daniel',
    tipologia: Tipologia.ALVENARIA,
    classificacao: ClassificacaoDanos.MINIMOS,
    danos: [],
    latitude: '',
    longitude: '',
    endereco: '',
  });

  const pdfRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const LOGO_DC_URL = "https://www.defesacivil.pr.gov.br/sites/defesa-civil/themes/custom/defesa_civil_theme/logo.png";

  useEffect(() => {
    const L = (window as any).L;
    if (!L || mapRef.current) return;

    const centroLat = -25.492578;
    const centroLng = -52.525791;

    mapRef.current = L.map('map-container').setView([centroLat, centroLng], 14);
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri' });
    const hybridLabels = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { opacity: 0.45 });
    
    satellite.addTo(mapRef.current);
    hybridLabels.addTo(mapRef.current);

    mapRef.current.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      updateLocationFromCoords(lat, lng);
    });

    // Forçar resize após render inicial para garantir que o mapa preencha o container em Desktop
    setTimeout(() => mapRef.current?.invalidateSize(), 500);

    return () => { if (mapRef.current) mapRef.current.remove(); };
  }, []);

  const updateLocationFromCoords = async (lat: number, lng: number) => {
    const L = (window as any).L;
    if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
    else markerRef.current = L.marker([lat, lng]).addTo(mapRef.current);
    mapRef.current.setView([lat, lng]);
    setFormData(prev => ({ ...prev, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`);
      const data = await resp.json();
      if (data) {
        const addr = data.address;
        const rua = addr.road || addr.street || addr.pedestrian || '';
        const num = addr.house_number || 'S/N';
        const bairro = addr.suburb || addr.neighbourhood || '';
        const cidade = addr.city || addr.town || '';
        setFormData(prev => ({ ...prev, endereco: `${rua}, ${num} - ${bairro}, ${cidade} - PR` }));
      }
    } catch (e) { console.error(e); }
  };

  const handleFileChange = async (tipo: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const base64Files = await Promise.all(files.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }));
      setFormData(prev => ({
        ...prev,
        danos: prev.danos?.map(d => d.tipo === tipo ? { ...d, fotos: [...d.fotos, ...base64Files] } : d)
      }));
    }
  };

  const removeFoto = (tipo: string, index: number) => {
    setFormData(prev => ({
      ...prev,
      danos: prev.danos?.map(d => d.tipo === tipo ? { ...d, fotos: d.fotos.filter((_, i) => i !== index) } : d)
    }));
  };

  useEffect(() => {
    let nivel = "";
    let percentual = "";
    switch (formData.classificacao) {
      case ClassificacaoDanos.MINIMOS: nivel = "Sem Destruição"; percentual = "10%"; break;
      case ClassificacaoDanos.PARCIAIS: nivel = "Destruição Parcial Leve"; percentual = "40%"; break;
      case ClassificacaoDanos.SEVEROS: nivel = "Destruição Parcial Grave"; percentual = "70%"; break;
      case ClassificacaoDanos.RUINA: nivel = "Destruição Total"; percentual = "100%"; break;
    }
    setFormData(prev => ({ ...prev, nivelDestruicao: nivel, percentualDestruicao: percentual }));
  }, [formData.classificacao]);

  const finalizeLaudo = async () => {
    setIsGenerating(true);
    try {
      const target = pdfRef.current!;
      const JsPDFConstructor = (window as any).jspdf?.jsPDF;
      const html2canvas = (window as any).html2canvas;
      
      const parent = target.parentElement!;
      parent.classList.remove('hidden');
      parent.setAttribute('style', 'position: absolute; left: -9999px; top: 0; display: block;');
      
      await new Promise(r => setTimeout(r, 2000));
      const canvas = await html2canvas(target, { scale: 2, useCORS: true, allowTaint: true });
      parent.classList.add('hidden');
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new JsPDFConstructor('p', 'mm', 'a4');
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      
      const nextId = laudosCount + 1;
      setLaudosCount(nextId);
      localStorage.setItem('laudosCount', nextId.toString());
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar PDF.");
    } finally { setIsGenerating(false); }
  };

  return (
    <div className="min-h-screen pb-32 max-w-5xl mx-auto px-4 lg:px-8 pt-6">
      <header className="flex flex-col md:flex-row items-center gap-6 mb-8 bg-[#f39200] text-[#002e6d] p-6 lg:p-10 rounded-[2.5rem] shadow-xl border-b-8 border-[#d17a00]">
        <div className="bg-white p-4 rounded-3xl shadow-md shrink-0">
          <img src={LOGO_DC_URL} alt="Defesa Civil PR" className="h-20 lg:h-24 w-auto" crossOrigin="anonymous" />
        </div>
        <div className="text-center md:text-left flex-grow">
          <h1 className="text-2xl lg:text-3xl font-black uppercase leading-none">Defesa Civil</h1>
          <p className="text-xl lg:text-2xl font-black uppercase text-white drop-shadow-md">ESTADO DO PARANÁ</p>
          <div className="h-1 bg-[#002e6d]/20 my-2 rounded-full w-full"></div>
          <p className="text-xs font-black uppercase tracking-widest text-[#002e6d] opacity-80">Portal de Vistoria e Laudos Técnicos</p>
        </div>
      </header>

      <div className="bg-white rounded-[3rem] shadow-2xl border border-orange-100 p-8 lg:p-12 space-y-12">
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
           <div className="space-y-4">
              <label className="text-[11px] font-black text-orange-600 uppercase tracking-widest ml-4">Informações da Vistoria</label>
              <div className="p-6 bg-orange-50 rounded-[2rem] border border-orange-100 flex justify-between items-center shadow-inner">
                <span className="text-[10px] font-bold text-orange-400 uppercase">Data do Relatório:</span>
                <span className="font-black text-[#002e6d] text-lg">{formData.data}</span>
              </div>
              <div className="space-y-1">
                 <p className="text-[10px] font-bold text-orange-400 uppercase ml-6">Município de Atendimento</p>
                 <select value={formData.municipio} onChange={(e) => setFormData({...formData, municipio: e.target.value})} className="w-full p-5 border-2 border-orange-50 rounded-[2rem] outline-none font-bold text-[#002e6d] bg-white shadow-sm hover:border-orange-200 focus:border-orange-400 transition-all cursor-pointer">
                   {MUNICIPIOS_PR.map(m => <option key={m} value={m}>{m}</option>)}
                 </select>
              </div>
           </div>

           <div className="space-y-4">
              <div className="flex justify-between items-center px-4">
                <label className="text-[11px] font-black text-orange-600 uppercase tracking-widest">Responsável Técnico</label>
                <button onClick={() => setShowEngenheiroModal(true)} className="text-[10px] font-black text-white bg-[#002e6d] px-4 py-2 rounded-full shadow-lg hover:bg-blue-800 transition-all">+ CADASTRAR NOVO</button>
              </div>
              <div className="space-y-1">
                 <p className="text-[10px] font-bold text-orange-400 uppercase ml-6">Selecione o Profissional:</p>
                 <select value={formData.engenheiro} onChange={(e) => setFormData({...formData, engenheiro: e.target.value})} className="w-full p-5 border-2 border-orange-50 rounded-[2rem] outline-none font-bold text-[#002e6d] bg-white shadow-sm hover:border-orange-200 focus:border-orange-400 transition-all cursor-pointer">
                   {engenheiros.map(e => <option key={e.nome} value={e.nome}>{e.nome}</option>)}
                 </select>
              </div>
              {engenheiros.find(e => e.nome === formData.engenheiro) && (
                <p className="text-[10px] text-slate-400 font-bold ml-6 uppercase tracking-tight">
                  CREA: {engenheiros.find(e => e.nome === formData.engenheiro)?.crea}
                </p>
              )}
           </div>
        </section>

        <section className="space-y-6">
           <div className="flex items-center justify-between px-4">
             <label className="text-[11px] font-black text-orange-600 uppercase tracking-widest">Geolocalização do Imóvel</label>
             <p className="text-[9px] font-bold text-slate-400 uppercase hidden md:block italic">Clique no local exato do sinistro para atualizar as coordenadas e o endereço</p>
           </div>
           <div className="relative group h-[450px] lg:h-[550px] w-full">
             <div id="map-container" className="h-full w-full rounded-[3.5rem] border-8 border-white shadow-2xl overflow-hidden ring-1 ring-orange-100"></div>
             <div className="absolute top-4 right-4 z-10 p-3 bg-white/90 backdrop-blur rounded-2xl shadow-xl border border-orange-100">
                <p className="text-[8px] font-black text-orange-500 uppercase leading-none mb-1">Coordenadas</p>
                <p className="font-mono text-[10px] text-[#002e6d] font-bold">{formData.latitude || '0.0000'}, {formData.longitude || '0.0000'}</p>
             </div>
           </div>
           <div className="p-8 bg-[#002e6d] rounded-[2.5rem] text-white shadow-2xl relative z-20 mx-2 lg:mx-8 -mt-12 lg:-mt-16 border-b-8 border-blue-900">
              <p className="text-[10px] font-black uppercase text-blue-300 mb-2 tracking-[0.2em]">Endereço Técnico Capturado:</p>
              <textarea name="endereco" value={formData.endereco} onChange={(e) => setFormData({...formData, endereco: e.target.value})} className="w-full bg-transparent border-none outline-none font-black text-lg lg:text-xl resize-none placeholder-blue-400 leading-tight" rows={2} placeholder="Clique no mapa..." />
           </div>
        </section>

        <section className="bg-orange-50 p-8 lg:p-12 rounded-[3.5rem] border-2 border-orange-100 shadow-inner">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-1">
                 <p className="text-[9px] font-black text-orange-400 uppercase ml-4">Inscrição Municipal</p>
                 <input type="text" onChange={(e) => setFormData({...formData, inscricaoMunicipal: e.target.value})} className="w-full p-5 rounded-[2rem] border-2 border-white focus:border-orange-300 outline-none font-bold text-[#002e6d] shadow-sm transition-all" placeholder="Número do IPTU" />
              </div>
              <div className="space-y-1">
                 <p className="text-[9px] font-black text-orange-400 uppercase ml-4">Proprietário</p>
                 <input type="text" onChange={(e) => setFormData({...formData, proprietario: e.target.value})} className="w-full p-5 rounded-[2rem] border-2 border-white focus:border-orange-300 outline-none font-bold text-[#002e6d] shadow-sm transition-all" placeholder="Nome Completo" />
              </div>
              <div className="space-y-1">
                 <p className="text-[9px] font-black text-orange-400 uppercase ml-4">Requerente</p>
                 <input type="text" onChange={(e) => setFormData({...formData, requerente: e.target.value})} className="w-full p-5 rounded-[2rem] border-2 border-white focus:border-orange-300 outline-none font-bold text-[#002e6d] shadow-sm transition-all" placeholder="Nome do Solicitante" />
              </div>
              <div className="space-y-1">
                 <p className="text-[9px] font-black text-orange-400 uppercase ml-4">Tipologia</p>
                 <select value={formData.tipologia} onChange={(e) => setFormData({...formData, tipologia: e.target.value as Tipologia})} className="w-full p-5 rounded-[2rem] border-2 border-white focus:border-orange-300 outline-none font-bold text-[#002e6d] shadow-sm cursor-pointer">
                   {Object.values(Tipologia).map(t => <option key={t} value={t}>{t}</option>)}
                 </select>
              </div>
           </div>
        </section>

        <section className="space-y-8">
           <label className="text-[11px] font-black text-orange-600 uppercase tracking-widest ml-4">Mapeamento de Danos Críticos</label>
           <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
             {DANOS_LIST.map(d => (
               <button 
                 key={d} 
                 onClick={() => {
                   setFormData(prev => {
                     const current = [...(prev.danos || [])];
                     const idx = current.findIndex(x => x.tipo === d);
                     if (idx > -1) current.splice(idx, 1);
                     else current.push({ tipo: d, descricao: '', fotos: [] });
                     return { ...prev, danos: current };
                   });
                 }}
                 className={`p-4 rounded-2xl text-[10px] font-black transition-all shadow-md transform active:scale-95 border-b-4 ${formData.danos?.find(x => x.tipo === d) ? 'bg-[#f39200] text-white border-orange-700' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}
               >
                 {d}
               </button>
             ))}
           </div>
           
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {formData.danos?.map(d => (
                <div key={d.tipo} className="p-8 bg-white border-2 border-orange-100 rounded-[3rem] space-y-6 shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-4 border-b border-orange-50 pb-4">
                     <div className="w-10 h-10 bg-orange-500 text-white rounded-2xl flex items-center justify-center font-black shadow-lg">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                     </div>
                     <p className="font-black text-[#002e6d] text-xl uppercase tracking-tighter">{d.tipo}</p>
                  </div>
                  <textarea 
                    value={d.descricao} 
                    onChange={(e) => setFormData(p => ({ ...p, danos: p.danos?.map(x => x.tipo === d.tipo ? { ...x, descricao: e.target.value } : x) }))}
                    className="w-full p-6 rounded-3xl border-none outline-none font-medium text-sm bg-orange-50/40 text-[#002e6d] placeholder-orange-200 resize-none shadow-inner" 
                    placeholder={`Detalhes técnicos para: ${d.tipo}`} 
                    rows={3}
                  />
                  <div className="space-y-4">
                     <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest ml-2">Evidências Fotográficas</p>
                     <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                        {d.fotos.map((f, i) => (
                          <div key={i} className="relative aspect-square group">
                            <img src={f} className="w-full h-full object-cover rounded-2xl border-2 border-white shadow-md group-hover:opacity-75 transition-opacity" />
                            <button onClick={() => removeFoto(d.tipo, i)} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1.5 shadow-xl hover:bg-red-700 hover:scale-110 transition-all">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          </div>
                        ))}
                        <label className="aspect-square flex flex-col items-center justify-center border-3 border-dashed border-orange-200 rounded-2xl cursor-pointer hover:bg-orange-50 hover:border-orange-300 transition-all text-orange-300 group">
                           <svg className="w-8 h-8 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                           <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFileChange(d.tipo, e)} />
                        </label>
                     </div>
                  </div>
                </div>
              ))}
           </div>
        </section>

        <section className="bg-gradient-to-br from-[#f39200] via-[#ff9c00] to-orange-500 p-12 lg:p-16 rounded-[4rem] text-[#002e6d] shadow-2xl">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-[0.3em] text-orange-900 opacity-60 ml-4">Parecer Técnico Conclusivo</label>
                    <select value={formData.classificacao} onChange={(e) => setFormData({...formData, classificacao: e.target.value as ClassificacaoDanos})} className="w-full p-6 bg-white border-4 border-white/40 rounded-[2.5rem] outline-none font-black text-2xl shadow-2xl text-[#002e6d] appearance-none cursor-pointer">
                       {Object.values(ClassificacaoDanos).map(c => <option key={c} value={c} className="text-slate-900">{c}</option>)}
                    </select>
                 </div>
                 <div className="p-8 bg-white/20 border-2 border-white/30 rounded-[2.5rem] backdrop-blur-sm shadow-inner">
                    <p className="text-[10px] font-black text-orange-900 uppercase mb-2 tracking-widest opacity-60">Impacto na Edificação</p>
                    <p className="font-black text-2xl lg:text-3xl uppercase text-white drop-shadow-lg">{formData.nivelDestruicao}</p>
                 </div>
              </div>
              <div className="flex flex-col items-center justify-center p-10 bg-[#002e6d] rounded-[4rem] shadow-2xl border-4 border-white/10">
                 <p className="text-[12px] font-black text-blue-300 uppercase mb-4 tracking-[0.4em]">Comprometimento Total</p>
                 <span className="text-7xl lg:text-9xl font-black text-white drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] leading-none">{formData.percentualDestruicao}</span>
              </div>
           </div>
        </section>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 p-6 bg-white/95 backdrop-blur-2xl border-t-2 border-orange-100 z-50">
        <div className="max-w-5xl mx-auto flex gap-6">
           <button onClick={finalizeLaudo} disabled={isGenerating} className="flex-1 py-6 bg-[#002e6d] hover:bg-blue-800 text-white rounded-[2.5rem] font-black text-2xl lg:text-3xl shadow-2xl transition-all transform active:scale-95 flex items-center justify-center gap-6 border-b-8 border-blue-900 disabled:opacity-50 group">
             {isGenerating ? (
               <div className="flex items-center gap-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-white/30 border-t-white"></div>
                  <span>PROCESSANDO LAUDO...</span>
               </div>
             ) : (
               <>
                 <svg className="w-10 h-10 lg:w-12 lg:h-12 group-hover:rotate-6 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                 <span>FINALIZAR E EMITIR PDF</span>
               </>
             )}
           </button>
        </div>
      </footer>

      {/* MODAL ENGENHEIRO */}
      {showEngenheiroModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex items-center justify-center p-6 z-[60] animate-in fade-in duration-300">
          <div className="bg-white rounded-[4rem] p-12 w-full max-w-xl space-y-8 shadow-2xl border-t-8 border-[#f39200]">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-black text-[#002e6d] uppercase tracking-tighter">Novo Credenciamento</h2>
              <div className="h-1.5 w-24 bg-orange-400 mx-auto rounded-full shadow-inner"></div>
            </div>
            <div className="space-y-4">
              <input value={newEng.nome} onChange={e => setNewEng({...newEng, nome: e.target.value})} className="w-full p-6 bg-orange-50 border-2 border-transparent focus:border-[#f39200] rounded-3xl outline-none font-bold text-[#002e6d] text-lg" placeholder="Nome Completo" />
              <input value={newEng.crea} onChange={e => setNewEng({...newEng, crea: e.target.value})} className="w-full p-6 bg-orange-50 border-2 border-transparent focus:border-[#f39200] rounded-3xl outline-none font-bold text-[#002e6d] text-lg" placeholder="Registro CREA/PR" />
              <input value={newEng.telefone} onChange={e => setNewEng({...newEng, telefone: e.target.value})} className="w-full p-6 bg-orange-50 border-2 border-transparent focus:border-[#f39200] rounded-3xl outline-none font-bold text-[#002e6d] text-lg" placeholder="Contato (WhatsApp)" />
            </div>
            <div className="flex gap-4">
              <button onClick={() => setShowEngenheiroModal(false)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-[2rem] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors">CANCELAR</button>
              <button onClick={() => {
                if(!newEng.nome || !newEng.crea) return alert("Nome e CREA são obrigatórios.");
                const updated = [...engenheiros, newEng];
                setEngenheiros(updated);
                localStorage.setItem('engenheiros', JSON.stringify(updated));
                setShowEngenheiroModal(false);
                setNewEng({nome:'', crea:'', endereco:'', telefone:''});
              }} className="flex-1 py-5 bg-[#002e6d] text-white rounded-[2rem] font-black uppercase tracking-widest shadow-xl hover:bg-blue-800 border-b-8 border-blue-900 transition-all active:scale-95">SALVAR CADASTRO</button>
            </div>
          </div>
        </div>
      )}

      {/* PDF TEMPLATE - POSICIONADO NO ESPAÇO BRANCO DO PAPEL TIMBRADO */}
      <div className="hidden">
        <div ref={pdfRef} className="bg-white" style={{ width: '210mm', minHeight: '297mm', position: 'relative', overflow: 'hidden' }}>
          {/* Imagem de Fundo Oficial */}
          <div className="absolute inset-0 z-0">
             <img src="https://i.ibb.co/VqnqF0f/papel-timbrado-defesa-civil-pr.png" alt="" style={{ width: '100%', height: '100%' }} crossOrigin="anonymous" />
          </div>

          {/* Conteúdo Técnico */}
          <div className="relative z-10 pt-[58mm] px-[22mm] pb-[45mm] h-full flex flex-col font-serif">
            <div className="text-center mb-12">
               <h2 className="text-[20pt] font-black text-[#002e6d] uppercase border-b-4 border-orange-400 inline-block pb-1 font-sans">Laudo de Vistoria de Edificação</h2>
               <p className="text-[11pt] font-bold text-slate-500 mt-3 uppercase tracking-widest font-sans">Documento Técnico Oficial</p>
            </div>

            <div className="grid grid-cols-2 gap-y-8 text-[11pt] bg-slate-50/70 p-8 rounded-[2rem] border-2 border-slate-100 mb-10 font-sans shadow-sm">
               <div className="space-y-4">
                  <p><span className="font-black text-orange-600 uppercase text-[9pt]">Município:</span><br/><span className="text-[12pt] font-black">{formData.municipio}</span></p>
                  <p><span className="font-black text-orange-600 uppercase text-[9pt]">Data da Inspeção:</span><br/><span className="text-[12pt] font-black">{formData.data}</span></p>
                  <p><span className="font-black text-orange-600 uppercase text-[9pt]">Proprietário:</span><br/><span className="text-[12pt] font-black uppercase">{formData.proprietario || 'NÃO DECLARADO'}</span></p>
               </div>
               <div className="space-y-4">
                  <p><span className="font-black text-orange-600 uppercase text-[9pt]">Coordenadas:</span><br/><span className="text-[12pt] font-black font-mono">{formData.latitude}, {formData.longitude}</span></p>
                  <p><span className="font-black text-orange-600 uppercase text-[9pt]">Engenheiro:</span><br/><span className="text-[12pt] font-black uppercase">{formData.engenheiro}</span></p>
                  <p><span className="font-black text-orange-600 uppercase text-[9pt]">Tipologia:</span><br/><span className="text-[12pt] font-black uppercase">{formData.tipologia}</span></p>
               </div>
               <div className="col-span-2 border-t-2 border-white pt-4">
                  <p><span className="font-black text-orange-600 uppercase text-[9pt]">Endereço Técnico:</span><br/><span className="text-[12pt] font-black uppercase leading-tight">{formData.endereco}</span></p>
               </div>
            </div>

            <div className="space-y-8 flex-grow font-sans">
               <h3 className="text-[14pt] font-black text-[#002e6d] uppercase border-l-8 border-[#f39200] pl-4 mb-6">Levantamento de Sinistro</h3>
               {formData.danos?.map(d => (
                 <div key={d.tipo} className="mb-6 p-6 bg-white border border-slate-200 rounded-3xl shadow-sm">
                    <p className="font-black text-slate-900 text-[11pt] uppercase mb-2 flex items-center gap-2">
                       <span className="w-2 h-2 bg-orange-500 rounded-full"></span> {d.tipo}
                    </p>
                    <p className="text-[10pt] leading-relaxed text-slate-700 italic border-l-2 border-slate-100 pl-4">{d.descricao || 'Sem observações complementares inseridas pelo perito.'}</p>
                 </div>
               ))}
               {formData.danos?.length === 0 && <p className="text-center italic text-slate-400 py-10">Nenhuma avaria registrada durante a vistoria de campo.</p>}
            </div>

            <div className="mt-auto pt-10 border-t-2 border-slate-100 flex justify-between items-center font-sans">
               <div className="bg-[#fdf2e9] p-8 rounded-[2.5rem] border-2 border-orange-100 min-w-[220px] shadow-sm">
                  <p className="text-[10pt] font-black text-orange-400 uppercase mb-1 tracking-widest">Avaliação Final</p>
                  <p className="text-[18pt] font-black text-[#002e6d] uppercase leading-none mb-1">{formData.classificacao}</p>
                  <p className="text-[11pt] font-black text-orange-600">{formData.nivelDestruicao} ({formData.percentualDestruicao})</p>
               </div>
               <div className="text-center w-[350px]">
                  <div className="border-b-2 border-slate-900 mb-4 h-16 w-full opacity-30"></div>
                  <p className="font-black text-[12pt] uppercase text-slate-800 leading-none">{formData.engenheiro}</p>
                  <p className="text-[9pt] text-slate-400 font-bold uppercase tracking-widest mt-1">Responsável Técnico • CREA/PR</p>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
