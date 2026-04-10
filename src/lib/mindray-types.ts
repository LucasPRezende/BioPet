export const EXAM_CODES: Record<string, { nome: string; unidade: string }> = {
  TGP:   { nome: 'TGP (ALT)',            unidade: 'U/L'   },
  ALT:   { nome: 'TGP (ALT)',            unidade: 'U/L'   },
  TGO:   { nome: 'TGO (AST)',            unidade: 'U/L'   },
  AST:   { nome: 'TGO (AST)',            unidade: 'U/L'   },
  AMIL:  { nome: 'Alfa Amilase',         unidade: 'U/L'   },
  COL:   { nome: 'Colesterol',           unidade: 'mg/dL' },
  CHOL:  { nome: 'Colesterol',           unidade: 'mg/dL' },
  CREA:  { nome: 'Creatinina',           unidade: 'mg/dL' },
  CRE:   { nome: 'Creatinina',           unidade: 'mg/dL' },
  FAL:   { nome: 'Fosfatase Alcalina',   unidade: 'U/L'   },
  ALP:   { nome: 'Fosfatase Alcalina',   unidade: 'U/L'   },
  GLIC:  { nome: 'Glicose',              unidade: 'mg/dL' },
  GLU:   { nome: 'Glicose',              unidade: 'mg/dL' },
  TRIG:  { nome: 'Triglicerídeos',       unidade: 'mg/dL' },
  TG:    { nome: 'Triglicerídeos',       unidade: 'mg/dL' },
  UREIA: { nome: 'Ureia',                unidade: 'mg/dL' },
  BUN:   { nome: 'Ureia',                unidade: 'mg/dL' },
  PROT:  { nome: 'Proteínas Totais',     unidade: 'g/dL'  },
  ALB:   { nome: 'Albumina',             unidade: 'g/dL'  },
  GLOB:  { nome: 'Globulina',            unidade: 'g/dL'  },
  CA:    { nome: 'Cálcio',               unidade: 'mg/dL' },
  PHOS:  { nome: 'Fósforo',              unidade: 'mg/dL' },
  NA:    { nome: 'Sódio',                unidade: 'mEq/L' },
  K:     { nome: 'Potássio',             unidade: 'mEq/L' },
  CL:    { nome: 'Cloro',                unidade: 'mEq/L' },
  BIL:   { nome: 'Bilirrubina Total',    unidade: 'mg/dL' },
  DBIL:  { nome: 'Bilirrubina Direta',   unidade: 'mg/dL' },
  IBIL:  { nome: 'Bilirrubina Indireta', unidade: 'mg/dL' },
  GGT:   { nome: 'GGT',                  unidade: 'U/L'   },
  LDH:   { nome: 'LDH',                  unidade: 'U/L'   },
  CK:    { nome: 'CK',                   unidade: 'U/L'   },
  LIPA:  { nome: 'Lipase',               unidade: 'U/L'   },
}

export interface MindrayResult {
  codigo:  string
  nome:    string
  valor:   string
  unidade: string
  metodo:  string
  status:  'N' | 'H' | 'L' | ''
}

export interface MindrayData {
  paciente:   string
  especie:    string
  sexo:       string
  idade:      string
  data_exame: string
  sample_id:  string
  resultados: MindrayResult[]
  raw_texts:  string[]
}
