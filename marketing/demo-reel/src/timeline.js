// Linha do tempo do reel (segundos). Gerada a partir da narração medida
// (audio/vo/take1.mp3, cortada pelos silêncios) e da grade da música:
// 120 BPM, compassos começando nos segundos ímpares (1, 3, 5...).
// NÃO EDITAR nas cenas — é a fonte única de sincronia.
window.TIMELINE = {
  __total: 45.0,
  bpm: 120,
  grid: 1.0, // uma cabeça de compasso; tempos a cada 0,5 s

  // Janelas das cenas. pre/post = quanto a cena aparece antes/depois (transição).
  hook: { start: 0.0, end: 3.0, pre: 0, post: 0 },
  reveal: { start: 3.0, end: 6.5, pre: 0, post: 0 },
  agenda: { start: 6.5, end: 10.5, pre: 0, post: 0 },
  whatsapp: { start: 10.5, end: 17.0, pre: 0, post: 0 },
  care: { start: 17.0, end: 22.5, pre: 0, post: 0 },
  quote: { start: 22.5, end: 27.0, pre: 0, post: 0 },
  payments: { start: 27.0, end: 35.0, pre: 0, post: 0 },
  finance: { start: 35.0, end: 40.0, pre: 0, post: 0 },
  endcard: { start: 40.0, end: 45.0, pre: 0.3, post: 0 }, // entra por cima com a íris em estrela

  // Falas da narração (tempo global de início e fim).
  vo: [
    { id: 'p1', text: 'Paciente faltou?', start: 0.25, end: 1.2 },
    { id: 'p2', text: 'Planilha que não fecha?', start: 1.3, end: 2.54 },
    { id: 'p3', text: 'Respira.', start: 3.15, end: 3.99 },
    { id: 'p4', text: 'Isso é DreamClin.', start: 4.25, end: 5.32 },
    { id: 'p5a', text: 'A recepção marca a Mariana.', start: 6.75, end: 8.2 },
    { id: 'p5b', text: 'Conflito? Avisado na hora.', start: 8.45, end: 10.49 },
    { id: 'p6', text: 'Marcou, a confirmação vai pelo WhatsApp.', start: 10.9, end: 13.21 },
    { id: 'p7', text: 'Ela toca em Confirmar, e a agenda já sabe.', start: 13.6, end: 16.2 },
    { id: 'p8', text: 'Ela chega, a recepção acompanha.', start: 17.2, end: 19.32 },
    { id: 'p9', text: 'Na ficha, odontograma dente a dente.', start: 19.6, end: 21.99 },
    { id: 'p10', text: 'O orçamento sai em minutos.', start: 22.75, end: 24.54 },
    { id: 'p11', text: 'Ela aceita.', start: 25.4, end: 26.08 },
    { id: 'p12', text: 'E paga como preferir:', start: 27.1, end: 28.3 },
    { id: 'p13a', text: 'pix, cartão de crédito ou débito, boleto, dinheiro ou transferência.', start: 28.55, end: 32.86 },
    { id: 'p13b', text: 'À vista ou parcelado.', start: 33.1, end: 34.62 },
    { id: 'p14', text: 'Você fecha o dia sem planilha, com os dados protegidos.', start: 35.4, end: 38.76 },
    { id: 'p15a', text: 'Sua clínica em dia.', start: 40.2, end: 41.65 },
    { id: 'p15b', text: 'Comece grátis em DreamClin ponto com.', start: 41.95, end: 44.2 },
  ],

  // Momentos-chave (tempo global). As cenas sincronizam o visual com eles.
  events: {
    stampFaltou: 0.55, // carimbo "Faltou" na palavra "faltou"
    whipPlanilha: 1.2,
    starCut: 2.45, // a estrela corta o caos
    respira: 3.15,
    logoGlint: 4.95, // estrela da logo brilha em "DreamClin"
    diveIntoD: 6.1,
    marianaBooked: 7.7, // bloco da Mariana assenta ("Mariana")
    conflict: 8.5, // "Conflito?"
    conflictSolved: 9.6, // "Avisado na hora"
    toBubble: 10.5,
    msgArrives: 11.2,
    reminder: 12.4, // lembrete na véspera
    tapConfirm: 14.4, // dedo toca em "Confirmar"
    confirmed: 14.5,
    agendaKnows: 15.6, // "a agenda já sabe"
    arrived: 17.4, // Na sala de espera
    inProgress: 19.2, // Em atendimento
    fichaOpens: 19.6,
    teeth: 20.4, // cascata dos dentes ("dente a dente")
    attended: 21.9, // Atendido
    quoteBuilds: 22.6,
    quoteSent: 24.5,
    viewed: 25.1,
    accepted: 26.0, // carimbo "Aceito" (motivo da estrela)
    payPix: 28.55,
    payCredit: 28.95,
    payDebit: 29.85,
    payBoleto: 30.75,
    payCash: 31.2,
    payTransfer: 31.95,
    aVista: 33.1,
    parcelado: 33.8,
    entradaPaga: 34.3,
    semPlanilha: 36.5,
    dadosProtegidos: 37.8,
    starIris: 39.7, // estrela abre o cartão final
    ctaButton: 42.0,
    ctaUrl: 42.9,
  },
};
