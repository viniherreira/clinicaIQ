import { redirect } from 'next/navigation';

/**
 * O plano mora nas Configurações agora.
 *
 * A rota continua existindo em vez de sumir porque links antigos apontam para
 * cá — favoritos da clínica, e-mails de cobrança já enviados. Sumir daria 404
 * em quem estava tentando pagar, que é a pior hora para dar 404.
 */
export default function PlanosPage() {
  redirect('/configuracoes#plano');
}
