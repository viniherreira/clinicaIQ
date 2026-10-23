/**
 * A API oficial no CRM: conectar, testar e desligar (a conta é da clínica e mora
 * em `lib/cloud-account-admin.ts`) e os modelos (em `lib/whatsapp-templates.ts`,
 * os mesmos da gestão). Quem chama já passou por `guardCrmAction('crm_config')`.
 */
export { checkCloud, connectManual, disconnectCloud, finishEmbeddedSignup } from '@/lib/cloud-account-admin';
export { createTemplate, fromGraph, syncTemplates, templateProblem } from '@/lib/whatsapp-templates';
