
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

  // URLs estáveis para as Logos
  const LOGO_DC_URL = "https://www.defesacivil.pr.gov.br/sites/defesa-civil/themes/custom/defesa_civil_theme/logo.png";
  const PAPEL_TIMBRADO_URL = "https://i.ibb.co/VqnqF0f/papel-timbrado-defesa-civil-pr.png"; // Mock do papel timbrado oficial

  useEffect(() => {
    const L = (window as any).L;
    if (!L || mapRef.current) return;

    const centroLat = -25.492578;
    const centroLng = -52.525791;

    mapRef.current = L.map('map-container').setView([centroLat, centroLng], 16);
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri' });
    const hybridLabels = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { opacity: 0.45 });
    
    satellite.addTo(mapRef.current);
    hybridLabels.addTo(mapRef.current);

    mapRef.current.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      updateLocationFromCoords(lat, lng);
    });

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
        setFormData(prev => ({ ...prev, endereco: `${rua}, ${num} - ${bairro}, ${addr.city || ''} - PR` }));
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
      
      await new Promise(r => setTimeout(r, 1500));
      const canvas = await html2canvas(target, { scale: 2, useCORS: true });
      parent.classList.add('hidden');
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new JsPDFConstructor('p', 'mm', 'a4');
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      
      // FIX: Ensure the output is correctly converted to a Blob using jsPDF's output method
      const blob = pdf.output('blob');
      window.open(URL.createObjectURL(blob), '_blank');
      
      const nextId = laudosCount + 1;
      setLaudosCount(nextId);
      localStorage.setItem('laudosCount', nextId.toString());
      alert("Laudo exportado com sucesso no papel timbrado.");
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar PDF.");
    } finally { setIsGenerating(false); }
  };

  return (
    <div className="min-h-screen pb-32 max-w-4xl mx-auto px-4 pt-6 bg-[#fdf2e9]">
      <header className="flex flex-col md:flex-row items-center gap-6 mb-8 bg-[#f39200] text-[#002e6d] p-8 rounded-[2rem] shadow-xl border-b-8 border-[#d17a00]">
        <div className="bg-white p-3 rounded-2xl shadow-md">
          <img src={LOGO_DC_URL} alt="Defesa Civil PR" className="h-16 w-auto" crossOrigin="anonymous" />
        </div>
        <div className="text-center md:text-left">
          <h1 className="text-2xl font-black uppercase leading-none">Defesa Civil</h1>
          <p className="text-xl font-black uppercase text-white drop-shadow-sm">ESTADO DO PARANÁ</p>
          <p className="text-[10px] mt-2 font-black opacity-80 uppercase tracking-widest text-[#002e6d]">Vistoria Técnica de Danos</p>
        </div>
      </header>

      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-orange-100 p-6 md:p-10 space-y-10">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div className="space-y-3">
              <label className="text-[11px] font-black text-orange-600 uppercase tracking-widest ml-2">Dados da Ocorrência</label>
              <div className="p-5 bg-orange-50 rounded-2xl border border-orange-100 flex justify-between items-center">
                <span className="text-[10px] font-bold text-orange-400 uppercase">Data:</span>
                <span className="font-black text-[#002e6d]">{formData.data}</span>
              </div>
              <div className="space-y-1">
                 <p className="text-[10px] font-bold text-orange-400 uppercase ml-4">Município</p>
                 <select name="municipio" value={formData.municipio} onChange={(e) => setFormData({...formData, municipio: e.target.value})} className="w-full p-4 border-2 border-orange-50 rounded-2xl outline-none font-bold text-[#002e6d] bg-white">
                   {MUNICIPIOS_PR.map(m => <option key={m} value={m}>{m}</option>)}
                 </select>
              </div>
           </div>

           <div className="space-y-3">
              <div className="flex justify-between items-center ml-2">
                <label className="text-[11px] font-black text-orange-600 uppercase tracking-widest">Engenheiro Responsável</label>
                <button onClick={() => setShowEngenheiroModal(true)} className="text-[9px] font-black text-white bg-[#002e6d] px-3 py-1 rounded-full shadow-sm">+ NOVO</button>
              </div>
              <div className="space-y-1">
                 <p className="text-[10px] font-bold text-orange-400 uppercase ml-4">Selecione:</p>
                 <select name="engenheiro" value={formData.engenheiro} onChange={(e) => setFormData({...formData, engenheiro: e.target.value})} className="w-full p-4 border-2 border-orange-50 rounded-2xl outline-none font-bold text-[#002e6d] bg-white">
                   {engenheiros.map(e => <option key={e.nome} value={e.nome}>{e.nome}</option>)}
                 </select>
              </div>
           </div>
        </section>

        <section className="space-y-4">
           <label className="text-[11px] font-black text-orange-600 uppercase tracking-widest ml-2">Localização (Clique no Mapa)</label>
           <div id="map-container" className="h-[350px] w-full rounded-[2.5rem] border-4 border-white shadow-lg overflow-hidden ring-1 ring-orange-100"></div>
           <div className="p-6 bg-[#002e6d] rounded-2xl text-white space-y-2">
              <p className="text-[9px] font-black uppercase text-blue-300">Endereço Confirmado:</p>
              <textarea name="endereco" value={formData.endereco} onChange={(e) => setFormData({...formData, endereco: e.target.value})} className="w-full bg-transparent border-none outline-none font-bold text-sm resize-none" rows={2} />
           </div>
        </section>

        <section className="bg-orange-50 p-8 rounded-[2.5rem] grid grid-cols-1 md:grid-cols-2 gap-6">
          <input name="inscricaoMunicipal" type="text" onChange={(e) => setFormData({...formData, inscricaoMunicipal: e.target.value})} className="w-full p-4 rounded-xl border-none font-bold placeholder-orange-200" placeholder="Inscrição Municipal" />
          <input name="proprietario" type="text" onChange={(e) => setFormData({...formData, proprietario: e.target.value})} className="w-full p-4 rounded-xl border-none font-bold placeholder-orange-200" placeholder="Proprietário" />
          <input name="requerente" type="text" onChange={(e) => setFormData({...formData, requerente: e.target.value})} className="w-full p-4 rounded-xl border-none font-bold placeholder-orange-200" placeholder="Requerente" />
          <select name="tipologia" value={formData.tipologia} onChange={(e) => setFormData({...formData, tipologia: e.target.value as Tipologia})} className="w-full p-4 rounded-xl border-none font-bold text-[#002e6d]">
            {Object.values(Tipologia).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </section>

        <section className="space-y-6">
           <label className="text-[11px] font-black text-orange-600 uppercase tracking-widest ml-2">Levantamento de Danos</label>
           <div className="flex flex-wrap gap-2">
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
                 className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all ${formData.danos?.find(x => x.tipo === d) ? 'bg-[#f39200] text-white' : 'bg-slate-100 text-slate-500'}`}
               >
                 {d}
               </button>
             ))}
           </div>
           
           <div className="space-y-6">
              {formData.danos?.map(d => (
                <div key={d.tipo} className="p-6 bg-white border-2 border-orange-50 rounded-[2rem] space-y-4 shadow-sm">
                  <p className="font-black text-[#002e6d] text-sm uppercase">{d.tipo}</p>
                  <textarea 
                    value={d.descricao} 
                    onChange={(e) => setFormData(p => ({ ...p, danos: p.danos?.map(x => x.tipo === d.tipo ? { ...x, descricao: e.target.value } : x) }))}
                    className="w-full p-4 rounded-xl border-none outline-none font-medium text-sm bg-orange-50/30" placeholder="Detalhes da avaria..." 
                  />
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                    {d.fotos.map((f, i) => (
                      <div key={i} className="relative group aspect-square">
                        <img src={f} className="w-full h-full object-cover rounded-xl border" />
                        <button onClick={() => removeFoto(d.tipo, i)} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-lg hover:bg-red-700">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                    ))}
                    <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-orange-200 rounded-xl cursor-pointer hover:bg-orange-50 text-orange-400">
                       <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                       <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFileChange(d.tipo, e)} />
                    </label>
                  </div>
                </div>
              ))}
           </div>
        </section>

        <section className="bg-gradient-to-br from-[#f39200] to-orange-600 p-10 rounded-[3rem] text-white shadow-xl">
           <div className="space-y-6">
              <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase tracking-widest text-orange-100">Avaliação Conclusiva</label>
                 <select name="classificacao" value={formData.classificacao} onChange={(e) => setFormData({...formData, classificacao: e.target.value as ClassificacaoDanos})} className="w-full p-4 bg-white/20 border-2 border-white/20 rounded-2xl outline-none font-black text-xl">
                    {Object.values(ClassificacaoDanos).map(c => <option key={c} value={c} className="text-slate-900">{c}</option>)}
                 </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="p-4 bg-white/10 rounded-2xl">
                    <p className="text-[9px] font-bold text-orange-100 uppercase mb-1">Impacto</p>
                    <p className="font-black text-xs uppercase">{formData.nivelDestruicao}</p>
                 </div>
                 <div className="p-4 bg-white/10 rounded-2xl text-center">
                    <p className="text-[9px] font-bold text-orange-100 uppercase mb-1">Comprometimento</p>
                    <p className="text-2xl font-black">{formData.percentualDestruicao}</p>
                 </div>
              </div>
           </div>
        </section>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 p-6 bg-white/90 backdrop-blur-xl border-t border-orange-100 z-50">
        <button onClick={finalizeLaudo} disabled={isGenerating} className="w-full py-5 bg-[#002e6d] hover:bg-[#f39200] text-white rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50">
           {isGenerating ? "GERANDO RELATÓRIO..." : "FINALIZAR E GERAR PDF"}
        </button>
      </footer>

      {/* MODAL ENGENHEIRO */}
      {showEngenheiroModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[60]">
          <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-md space-y-6 shadow-2xl">
            <h2 className="text-2xl font-black text-[#002e6d] uppercase">Novo Engenheiro</h2>
            <input value={newEng.nome} onChange={e => setNewEng({...newEng, nome: e.target.value})} className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl outline-none font-bold" placeholder="Nome Completo" />
            <input value={newEng.crea} onChange={e => setNewEng({...newEng, crea: e.target.value})} className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl outline-none font-bold" placeholder="CREA/PR" />
            <input value={newEng.telefone} onChange={e => setNewEng({...newEng, telefone: e.target.value})} className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-orange-500 rounded-2xl outline-none font-bold" placeholder="Telefone" />
            <div className="flex gap-4">
              <button onClick={() => setShowEngenheiroModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-xl font-bold">CANCELAR</button>
              <button onClick={() => {
                const updated = [...engenheiros, newEng];
                setEngenheiros(updated);
                localStorage.setItem('engenheiros', JSON.stringify(updated));
                setShowEngenheiroModal(false);
                setNewEng({nome:'', crea:'', endereco:'', telefone:''});
              }} className="flex-1 py-4 bg-[#002e6d] text-white rounded-xl font-black shadow-md">SALVAR</button>
            </div>
          </div>
        </div>
      )}

      {/* PDF TEMPLATE COM PAPEL TIMBRADO (Espaço em branco utilizado) */}
      <div className="hidden">
        <div ref={pdfRef} className="bg-white text-slate-900" style={{ width: '210mm', minHeight: '297mm', position: 'relative' }}>
          {/* Imagem de Fundo (Papel Timbrado) */}
          <div className="absolute inset-0 z-0">
             <img src="https://i.ibb.co/VqnqF0f/papel-timbrado-defesa-civil-pr.png" alt="" style={{ width: '100%', height: '100%' }} crossOrigin="anonymous" />
          </div>

          {/* Conteúdo Técnico Posicionado no Espaço Branco */}
          <div className="relative z-10 pt-[55mm] px-[20mm] pb-[40mm] h-full flex flex-col">
            <div className="text-center mb-10">
               <h2 className="text-[18pt] font-black text-[#002e6d] uppercase border-b-2 border-orange-400 inline-block pb-1">Laudo Técnico de Vistoria Post-Evento</h2>
               <p className="text-[10pt] font-bold text-slate-500 mt-2">CONTROLE Nº {String(formData.id).padStart(4, '0')} - ANO {new Date().getFullYear()}</p>
            </div>

            <div className="grid grid-cols-2 gap-y-6 text-[10pt] bg-slate-50/50 p-6 rounded-2xl border border-slate-100 mb-8">
               <div className="space-y-2">
                  <p><span className="font-black uppercase text-orange-600">Município:</span> {formData.municipio}</p>
                  <p><span className="font-black uppercase text-orange-600">Data:</span> {formData.data}</p>
                  <p><span className="font-black uppercase text-orange-600">Proprietário:</span> {formData.proprietario || 'N/A'}</p>
                  <p><span className="font-black uppercase text-orange-600">Tipologia:</span> {formData.tipologia}</p>
               </div>
               <div className="space-y-2">
                  <p><span className="font-black uppercase text-orange-600">Coordenadas:</span> {formData.latitude}, {formData.longitude}</p>
                  <p><span className="font-black uppercase text-orange-600">Engenheiro:</span> {formData.engenheiro}</p>
                  <p><span className="font-black uppercase text-orange-600">Inscrição Mun.:</span> {formData.inscricaoMunicipal || 'N/A'}</p>
               </div>
               <div className="col-span-2 border-t border-slate-200 pt-3">
                  <p><span className="font-black uppercase text-orange-600">Localização:</span> {formData.endereco}</p>
               </div>
            </div>

            <div className="space-y-6 flex-grow">
               <h3 className="text-[12pt] font-black text-[#002e6d] uppercase border-l-4 border-[#f39200] pl-3 mb-4">Relato de Avarias Técnicas</h3>
               {formData.danos?.map(d => (
                 <div key={d.tipo} className="mb-4">
                    <p className="font-black text-slate-800 text-[10pt] uppercase mb-1">{d.tipo}</p>
                    <p className="text-[9pt] leading-relaxed text-slate-600 italic pl-4 border-l border-slate-200">{d.descricao || 'Sem observações detalhadas.'}</p>
                 </div>
               ))}
               {formData.danos?.length === 0 && <p className="text-center italic text-slate-400">Nenhum dano registrado.</p>}
            </div>

            <div className="mt-auto pt-10 border-t-2 border-slate-100 flex justify-between items-end">
               <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100 min-w-[200px]">
                  <p className="text-[9pt] font-black text-orange-400 uppercase mb-1">Classificação Final</p>
                  <p className="text-[14pt] font-black text-[#002e6d] uppercase leading-none">{formData.classificacao}</p>
                  <p className="text-[10pt] font-bold text-orange-600 mt-1">{formData.nivelDestruicao}</p>
               </div>
               <div className="text-center w-[300px]">
                  <div className="border-b-2 border-slate-900 mb-2 h-10"></div>
                  <p className="font-black text-[10pt] uppercase">{formData.engenheiro}</p>
                  <p className="text-[8pt] text-slate-400 font-bold uppercase">CREA/PR • Defesa Civil Paraná</p>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
