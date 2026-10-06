import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import {
  clinicSigner,
  color,
  DocFooter,
  DocHeader,
  documentLabel,
  formatCurrency,
  s,
  Signature,
  TotalsBox,
  TreatmentTable,
  type ClinicInfo,
  type Person,
  type TreatmentItem,
} from './theme';

/**
 * Contrato de prestação de serviços, gerado a partir de um orçamento.
 *
 * O texto é um modelo de referência construído sobre o que o Código de Defesa
 * do Consumidor permite (multa de 2%, foro que não tira do paciente o direito de
 * processar onde mora) e sobre a LGPD. A clínica acrescenta as próprias
 * cláusulas nas configurações; não as substitui — o miolo fica igual para todas
 * e é revisado num lugar só.
 *
 * O que falta no cadastro sai como linha em branco, para completar à caneta.
 * Contrato com campo vazio impresso é melhor do que contrato que não sai.
 */
export interface ContractDocumentProps {
  clinic: ClinicInfo;
  patient: {
    name: string;
    document?: string;
    maritalStatus?: string;
    profession?: string;
    birthDate?: string;
    address?: string;
    phone?: string;
    email?: string;
    /** Menor de idade assina por meio do responsável legal. */
    isMinor: boolean;
  };
  professional?: Person;
  contract: {
    /** CTR-0001 */
    code: string;
    /** ORC-0001 */
    quoteCode: string;
    /** "Contrato de prestação de serviços odontológicos" */
    title: string;
    items: TreatmentItem[];
    subtotal: number;
    discountAmount: number;
    discountLabel?: string;
    total: number;
    totalText: string;
    /** Frase de `describePayment`. */
    payment: string;
    /** Cláusulas próprias da clínica. */
    extraTerms?: string;
    /** "3 de outubro de 2026" */
    dateLong: string;
    issuedAt: string;
    generatedAt: string;
  };
}

const ORDINAIS = [
  'PRIMEIRA',
  'SEGUNDA',
  'TERCEIRA',
  'QUARTA',
  'QUINTA',
  'SEXTA',
  'SÉTIMA',
  'OITAVA',
  'NONA',
  'DÉCIMA',
  'DÉCIMA PRIMEIRA',
  'DÉCIMA SEGUNDA',
];

const BRANCO = '______________________________';
const BRANCO_CURTO = '__________________';

function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 11 }}>
      <Text minPresenceAhead={36} style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: color.ink, marginBottom: 4 }}>
        CLÁUSULA {ORDINAIS[n - 1] ?? n} — {title}
      </Text>
      {children}
    </View>
  );
}

function P({ n, children }: { n?: string; children: React.ReactNode }) {
  return (
    <Text style={{ ...s.paragraph, fontSize: 9.3, marginBottom: 3.5 }}>
      {n ? <Text style={s.bold}>{n} </Text> : null}
      {children}
    </Text>
  );
}

export function ContractDocument({ clinic, patient, professional, contract }: ContractDocumentProps) {
  const signer = clinicSigner(clinic, professional);
  const rt = clinic.technicalResponsible
    ? { name: clinic.technicalResponsible, registration: clinic.technicalRegistration }
    : undefined;

  const qualificacaoPaciente = [
    patient.maritalStatus?.toLowerCase(),
    patient.profession?.toLowerCase(),
    patient.birthDate ? `nascido(a) em ${patient.birthDate}` : undefined,
  ].filter(Boolean);

  const extras = (contract.extraTerms ?? '')
    .split(/\n{2,}|\r\n\r\n/)
    .map((t) => t.trim())
    .filter(Boolean);

  // Numeração contínua: as cláusulas da clínica entram antes do foro, que é
  // sempre a última.
  let n = 0;
  const next = () => ++n;

  return (
    <Document title={`${contract.title} — ${patient.name}`} author={clinic.name} language="pt-BR">
      <Page size="A4" style={s.page}>
        <DocHeader
          clinic={clinic}
          kind="Contrato"
          code={contract.code}
          meta={[
            { label: 'Orçamento', value: contract.quoteCode },
            { label: 'Emissão', value: contract.issuedAt },
          ]}
        />

        <Text
          style={{
            fontSize: 12,
            fontFamily: 'Helvetica-Bold',
            color: color.ink,
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            marginBottom: 14,
          }}
        >
          {contract.title}
        </Text>

        <Text style={{ ...s.sectionTitle, marginBottom: 5 }}>Das partes</Text>

        <P>
          <Text style={s.bold}>CONTRATADA: </Text>
          {clinic.name}, inscrita no {clinic.document ? documentLabel(clinic.document) : 'CNPJ/CPF'} sob o nº{' '}
          {clinic.document ?? BRANCO_CURTO}, com endereço em {clinic.address ?? BRANCO}
          {rt
            ? `, neste ato representada por seu(sua) responsável técnico(a), ${rt.name}${rt.registration ? `, ${rt.registration}` : ''}`
            : ''}
          .
        </P>

        <P>
          <Text style={s.bold}>CONTRATANTE: </Text>
          {patient.name}
          {qualificacaoPaciente.length > 0 ? `, ${qualificacaoPaciente.join(', ')}` : ''}, inscrito(a) no CPF sob o
          nº {patient.document ?? BRANCO_CURTO}, residente e domiciliado(a) em {patient.address ?? BRANCO}
          {patient.phone ? `, telefone ${patient.phone}` : ''}
          {patient.email ? `, e-mail ${patient.email}` : ''}
          {patient.isMinor
            ? `, neste ato representado(a) por seu(sua) responsável legal, ${BRANCO}, inscrito(a) no CPF sob o nº ${BRANCO_CURTO}`
            : ''}
          .
        </P>

        <P>
          As partes acima qualificadas têm entre si justo e contratado o presente contrato de prestação de
          serviços, que se regerá pelas cláusulas e condições seguintes.
        </P>

        <Clause n={next()} title="DO OBJETO">
          <P n="1.1.">
            O presente contrato tem por objeto a prestação, pela CONTRATADA ao(à) CONTRATANTE, dos serviços
            descritos no plano de tratamento abaixo, conforme o Orçamento {contract.quoteCode}, que passa a
            integrar este instrumento.
          </P>
          <View style={{ marginTop: 4, marginBottom: 6 }}>
            <TreatmentTable items={contract.items} compact />
            <View style={{ alignItems: 'flex-end', marginTop: 8 }} wrap={false}>
              <TotalsBox
                subtotal={contract.subtotal}
                discountAmount={contract.discountAmount}
                discountLabel={contract.discountLabel}
                total={contract.total}
              />
            </View>
          </View>
          <P n="1.2.">
            O plano de tratamento foi definido após avaliação clínica. O(A) CONTRATANTE declara ter sido
            informado(a) sobre os procedimentos, suas alternativas, riscos, benefícios, cuidados necessários e
            duração estimada, e ter tido a oportunidade de esclarecer todas as suas dúvidas.
          </P>
          {professional?.name ? (
            <P n="1.3.">
              Os serviços serão executados por {professional.name}
              {professional.registration ? `, ${professional.registration}` : ''}, ou por outro profissional
              legalmente habilitado da equipe da CONTRATADA.
            </P>
          ) : null}
        </Clause>

        <Clause n={next()} title="DO PREÇO E DA FORMA DE PAGAMENTO">
          <P n="2.1.">
            Pelos serviços objeto deste contrato, o(a) CONTRATANTE pagará à CONTRATADA o valor total de{' '}
            <Text style={s.bold}>{formatCurrency(contract.total)}</Text> ({contract.totalText}).
          </P>
          <P n="2.2.">O pagamento será efetuado da seguinte forma: {contract.payment}</P>
          <P n="2.3.">
            O atraso no pagamento de qualquer valor sujeitará o(a) CONTRATANTE à multa de 2% (dois por cento)
            sobre a quantia devida, acrescida de juros de mora de 1% (um por cento) ao mês, calculados pro rata
            die, e de correção monetária.
          </P>
          <P n="2.4.">
            Procedimentos não previstos no plano de tratamento que se mostrem necessários no curso do
            tratamento serão objeto de novo orçamento, a ser previamente aprovado pelo(a) CONTRATANTE.
          </P>
        </Clause>

        <Clause n={next()} title="DAS OBRIGAÇÕES DA CONTRATADA">
          <P n="3.1.">
            Executar os serviços com zelo e diligência, empregando a técnica adequada e observando as normas
            éticas e legais que regem a profissão.
          </P>
          <P n="3.2.">
            Prestar ao(à) CONTRATANTE as informações e orientações necessárias antes, durante e após cada
            etapa do tratamento.
          </P>
          <P n="3.3.">
            Manter prontuário atualizado e guardar sigilo sobre as informações do(a) CONTRATANTE, nos termos da
            legislação vigente.
          </P>
          <P n="3.4.">Utilizar materiais de qualidade, devidamente regularizados nos órgãos competentes.</P>
        </Clause>

        <Clause n={next()} title="DAS OBRIGAÇÕES DO(A) CONTRATANTE">
          <P n="4.1.">
            Fornecer informações verdadeiras e completas sobre seu estado de saúde, histórico, medicamentos em
            uso e alergias, comunicando qualquer alteração no curso do tratamento.
          </P>
          <P n="4.2.">
            Comparecer pontualmente às consultas agendadas e seguir as orientações e prescrições recebidas,
            inclusive os cuidados posteriores aos procedimentos.
          </P>
          <P n="4.3.">Efetuar os pagamentos nas datas e condições ajustadas.</P>
          <P n="4.4.">
            Comunicar a impossibilidade de comparecer com antecedência mínima de 24 (vinte e quatro) horas.
            Faltas reiteradas sem aviso podem comprometer o cronograma e o resultado do tratamento.
          </P>
        </Clause>

        <Clause n={next()} title="DOS RESULTADOS">
          <P n="5.1.">
            A CONTRATADA compromete-se a empregar todos os meios técnicos e científicos adequados à obtenção do
            melhor resultado possível. O(A) CONTRATANTE declara ciência de que o resultado depende também de
            fatores biológicos individuais e de sua própria colaboração, em especial quanto à higiene, ao
            comparecimento às consultas e ao cumprimento das orientações recebidas.
          </P>
        </Clause>

        <Clause n={next()} title="DA VIGÊNCIA E DA RESCISÃO">
          <P n="6.1.">
            Este contrato vigora a partir da data de sua assinatura até a conclusão do tratamento descrito na
            Cláusula Primeira.
          </P>
          <P n="6.2.">
            Qualquer das partes poderá rescindir este contrato mediante comunicação por escrito. Nesse caso,
            serão devidos os valores correspondentes aos procedimentos já realizados e aos materiais adquiridos
            ou confeccionados especificamente para o(a) CONTRATANTE; havendo valores pagos a maior, serão
            restituídos em até 30 (trinta) dias.
          </P>
        </Clause>

        <Clause n={next()} title="DA PROTEÇÃO DE DADOS PESSOAIS">
          <P n="7.1.">
            Os dados pessoais e de saúde do(a) CONTRATANTE serão tratados pela CONTRATADA para a execução deste
            contrato, a tutela da saúde e o cumprimento de obrigações legais e regulatórias, nos termos da Lei nº
            13.709/2018 (LGPD), mantidos sob sigilo e guardados pelo prazo exigido pela legislação.
          </P>
        </Clause>

        {extras.length > 0 ? (
          <Clause n={next()} title="DISPOSIÇÕES ADICIONAIS">
            {extras.map((t, i) => (
              <P key={i} n={`${n}.${i + 1}.`}>
                {t}
              </P>
            ))}
          </Clause>
        ) : null}

        {(() => {
          const foro = next();
          return (
            <Clause n={foro} title="DO FORO">
              <P n={`${foro}.1.`}>
                Fica eleito o foro da comarca de {clinic.cityState ?? BRANCO_CURTO} para dirimir quaisquer
                questões oriundas deste contrato, ressalvado o direito do(a) CONTRATANTE de demandar no foro de
                seu domicílio.
              </P>
            </Clause>
          );
        })()}

        {/* Fecho e assinaturas: inteiros na mesma folha */}
        <View wrap={false} style={{ marginTop: 14 }}>
          <P>
            E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias
            de igual teor e forma, na presença das testemunhas abaixo.
          </P>
          <Text style={{ fontSize: 9.5, marginTop: 8, textAlign: 'right' }}>
            {clinic.city ?? '____________________'}, {contract.dateLong}.
          </Text>

          <View style={{ flexDirection: 'row', marginTop: 6, marginHorizontal: -12 }}>
            <Signature
              title={patient.name}
              lines={[
                patient.isMinor ? 'CONTRATANTE (por seu responsável legal)' : 'CONTRATANTE',
                patient.document ? `CPF ${patient.document}` : undefined,
              ]}
            />
            <Signature
              title={clinic.name}
              lines={['CONTRATADA', signer ? [signer.name, signer.registration].filter(Boolean).join(' — ') : undefined]}
            />
          </View>
          <View style={{ flexDirection: 'row', marginTop: 4, marginHorizontal: -12 }}>
            <Signature title="Testemunha 1" lines={['Nome:', 'CPF:']} />
            <Signature title="Testemunha 2" lines={['Nome:', 'CPF:']} />
          </View>
        </View>

        <DocFooter clinic={clinic} issuedAt={contract.generatedAt} />
      </Page>
    </Document>
  );
}
