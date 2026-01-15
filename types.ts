
export enum Tipologia {
  ALVENARIA = "Casa de Alvenaria",
  MADEIRA = "Casa de Madeira",
  MISTA = "Casa Mista",
  LOJA = "Loja Comercial",
  PREDIO_COMERCIAL = "Prédio Comercial",
  PAVILHAO_COMERCIAL = "Pavilhão Comercial",
  PAVILHAO_INDUSTRIAL = "Pavilhão Industrial",
  EQUIPAMENTO_PUBLICO = "Equipamento Público",
  OUTRO = "Outro"
}

export enum ClassificacaoDanos {
  MINIMOS = "Danos Mínimos",
  PARCIAIS = "Danos Parciais",
  SEVEROS = "Danos Severos",
  RUINA = "Ruína"
}

export interface Engenheiro {
  nome: string;
  crea: string;
  endereco: string;
  telefone: string;
}

export interface DanoSelecionado {
  tipo: string;
  descricao: string;
  fotos: string[]; // base64 strings
}

export interface Laudo {
  id: number;
  municipio: string;
  data: string;
  engenheiro: string;
  inscricaoMunicipal: string;
  proprietario: string;
  requerente: string;
  endereco: string;
  latitude: string;
  longitude: string;
  tipologia: Tipologia;
  tipologiaOutro?: string;
  danos: DanoSelecionado[];
  classificacao: ClassificacaoDanos;
  nivelDestruicao: string;
  percentualDestruicao: string;
}
