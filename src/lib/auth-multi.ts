// Verifica se há QUALQUER sessão válida do sistema (admin/usuário), de
// veterinário ou de clínica. Usado para proteger recursos acessíveis por
// qualquer perfil logado (ex.: visualização de laudo).
import { parseSystemSession, SESSION_COOKIE_NAME } from './system-auth'
import { parseVetSession } from './vet-auth'
import { parseClinicaSession, CLINICA_COOKIE_NAME } from './clinica-auth'

export async function hasAnyValidSession(
  getCookie: (name: string) => string | undefined,
): Promise<boolean> {
  const sys = getCookie(SESSION_COOKIE_NAME)
  if (sys && (await parseSystemSession(sys))) return true

  const vet = getCookie('vet_session')
  if (vet && (await parseVetSession(vet))) return true

  const cli = getCookie(CLINICA_COOKIE_NAME)
  if (cli && (await parseClinicaSession(cli))) return true

  return false
}
