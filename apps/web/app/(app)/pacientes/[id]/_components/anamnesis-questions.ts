/**
 * Standard dental/aesthetic anamnesis questionnaire. Shared by the form (client)
 * and the save action (server) so keys are always in sync. `critical` answers
 * marked "yes" are surfaced as red alert chips at the top of the record.
 */

export interface AnamnesisQuestion {
  key: string;
  label: string;
  /** Placeholder for the follow-up detail input shown when the answer is "yes". */
  detail?: string;
  /** "Yes" here must jump out to the professional (allergy, anesthesia...). */
  critical?: boolean;
  /** Bloco da ficha em que a pergunta aparece. */
  group: AnamnesisGroup;
}

export type AnamnesisGroup = 'alertas' | 'saude' | 'habitos' | 'outros';
export const ANAMNESIS_GROUPS: { id: AnamnesisGroup; label: string; hint: string }[] = [
  { id: 'alertas', label: 'Alergias e reações', hint: 'O que precisa ser visto antes de anestesiar ou medicar.' },
  { id: 'saude', label: 'Saúde geral', hint: 'Tratamentos, remédios e doenças.' },
  { id: 'habitos', label: 'Hábitos', hint: 'Fumo e bebida.' },
  { id: 'outros', label: 'Outros', hint: 'Gravidez e cirurgias.' },
];

export const ANAMNESIS_QUESTIONS: AnamnesisQuestion[] = [
  { key: 'treatment', label: 'Está em tratamento médico atualmente?', detail: 'Qual tratamento?', group: 'saude' },
  { key: 'medication', label: 'Faz uso contínuo de algum medicamento?', detail: 'Quais medicamentos?', group: 'saude' },
  { key: 'allergy', label: 'Tem alergia a algum medicamento ou substância?', detail: 'Quais?', critical: true, group: 'alertas' },
  { key: 'anesthesia', label: 'Já teve reação a anestesia (odontológica ou geral)?', detail: 'O que aconteceu?', critical: true, group: 'alertas' },
  { key: 'bleeding', label: 'Tem problema de cicatrização ou sangramento excessivo?', critical: true, group: 'alertas' },
  { key: 'diabetes', label: 'Tem diabetes?', group: 'saude' },
  { key: 'hypertension', label: 'Tem pressão alta (hipertensão)?', group: 'saude' },
  { key: 'heart', label: 'Tem algum problema cardíaco?', detail: 'Qual?', group: 'saude' },
  { key: 'hepatitis', label: 'Já teve hepatite ou outro problema no fígado?', group: 'saude' },
  { key: 'kidney', label: 'Tem algum problema renal?', group: 'saude' },
  { key: 'respiratory', label: 'Tem asma, bronquite ou outro problema respiratório?', group: 'saude' },
  { key: 'epilepsy', label: 'Tem epilepsia ou já teve convulsões?', group: 'saude' },
  { key: 'infectious', label: 'Tem alguma doença infectocontagiosa?', detail: 'Qual?', group: 'saude' },
  { key: 'osteoporosis', label: 'Tem osteoporose ou usa bifosfonatos?', group: 'saude' },
  { key: 'smoker', label: 'Fuma?', group: 'habitos' },
  { key: 'alcohol', label: 'Consome bebida alcoólica com frequência?', group: 'habitos' },
  { key: 'pregnant', label: 'Está grávida ou amamentando?', group: 'outros' },
  { key: 'surgery', label: 'Já passou por alguma cirurgia?', detail: 'Qual?', group: 'outros' },
];

export type AnamnesisAnswer = { value: 'yes' | 'no'; detail?: string };
export type AnamnesisAnswers = {
  items: Record<string, AnamnesisAnswer>;
  obs?: string;
};

export const ANAMNESIS_KEYS = new Set(ANAMNESIS_QUESTIONS.map((q) => q.key));
