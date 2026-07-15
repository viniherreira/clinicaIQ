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
}

export const ANAMNESIS_QUESTIONS: AnamnesisQuestion[] = [
  { key: 'treatment', label: 'Está em tratamento médico atualmente?', detail: 'Qual tratamento?' },
  { key: 'medication', label: 'Faz uso contínuo de algum medicamento?', detail: 'Quais medicamentos?' },
  { key: 'allergy', label: 'Tem alergia a algum medicamento ou substância?', detail: 'Quais?', critical: true },
  { key: 'anesthesia', label: 'Já teve reação a anestesia (odontológica ou geral)?', detail: 'O que aconteceu?', critical: true },
  { key: 'bleeding', label: 'Tem problema de cicatrização ou sangramento excessivo?', critical: true },
  { key: 'diabetes', label: 'Tem diabetes?' },
  { key: 'hypertension', label: 'Tem pressão alta (hipertensão)?' },
  { key: 'heart', label: 'Tem algum problema cardíaco?', detail: 'Qual?' },
  { key: 'hepatitis', label: 'Já teve hepatite ou outro problema no fígado?' },
  { key: 'kidney', label: 'Tem algum problema renal?' },
  { key: 'respiratory', label: 'Tem asma, bronquite ou outro problema respiratório?' },
  { key: 'epilepsy', label: 'Tem epilepsia ou já teve convulsões?' },
  { key: 'infectious', label: 'Tem alguma doença infectocontagiosa?', detail: 'Qual?' },
  { key: 'osteoporosis', label: 'Tem osteoporose ou usa bifosfonatos?' },
  { key: 'smoker', label: 'Fuma?' },
  { key: 'alcohol', label: 'Consome bebida alcoólica com frequência?' },
  { key: 'pregnant', label: 'Está grávida ou amamentando?' },
  { key: 'surgery', label: 'Já passou por alguma cirurgia?', detail: 'Qual?' },
];

export type AnamnesisAnswer = { value: 'yes' | 'no'; detail?: string };
export type AnamnesisAnswers = {
  items: Record<string, AnamnesisAnswer>;
  obs?: string;
};

export const ANAMNESIS_KEYS = new Set(ANAMNESIS_QUESTIONS.map((q) => q.key));
