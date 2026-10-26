import { normalize, normalizeEmail } from './utils';

export interface UserAusenciaInfo {
  id?: string | number;
  nome?: string;
  email?: string;
  matricula?: string;
  ausente?: boolean;
  ausente_tipo?: string | null;
  ausenteTipo?: string | null;
  ausente_inicio?: string | Date | null;
  ausenteInicio?: string | Date | null;
  ausente_fim?: string | Date | null;
  ausenteFim?: string | Date | null;
  ausente_motivo?: string | null;
  ausenteMotivo?: string | null;
}

/**
 * Converte Date, string ISO ('YYYY-MM-DD') ou BR ('DD/MM/AAAA') para objeto Date (à meia-noite local).
 */
export function parseDateFlexible(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  }

  const str = String(val).trim();
  if (!str) return null;

  // Formato DD/MM/AAAA
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [dd, mm, yyyy] = str.split('/');
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (isNaN(d.getTime())) return null;
    return d;
  }

  // Formato YYYY-MM-DD (ou ISO)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (isNaN(d.getTime())) return null;
    return d;
  }

  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Formata Date ou string para DD/MM/AAAA
 */
export function formatToDateBr(val: any): string {
  const d = parseDateFlexible(val);
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formata Date ou string para YYYY-MM-DD (para input type="date")
 */
export function formatToDateIso(val: any): string {
  const d = parseDateFlexible(val);
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${year}-${month}-${day}`;
}

/**
 * Verifica se um usuário está ausente/afastado em uma determinada data (padrão: hoje).
 * Se o prazo da demanda cair dentro do período de afastamento do colaborador, também é considerado ausente.
 */
export function isUsuarioAusente(user: UserAusenciaInfo | null | undefined, targetDate?: any): boolean {
  if (!user) return false;

  const ausenteFlag = !!(user.ausente);
  const inicioVal = user.ausente_inicio || user.ausenteInicio;
  const fimVal = user.ausente_fim || user.ausenteFim;

  const dataInicio = parseDateFlexible(inicioVal);
  const dataFim = parseDateFlexible(fimVal);

  const hoje = parseDateFlexible(new Date())!;
  const dataAlvo = targetDate ? parseDateFlexible(targetDate) || hoje : hoje;

  // Se o usuário tem ausente marcado como TRUE
  if (ausenteFlag) {
    // Se definiu período
    if (dataInicio && dataFim) {
      // Se a data de hoje já passou do fim do afastamento, o período expirou
      if (dataAlvo.getTime() > dataFim.getTime()) {
        return false;
      }
      // Se a data alvo está dentro do período
      if (dataAlvo.getTime() >= dataInicio.getTime() && dataAlvo.getTime() <= dataFim.getTime()) {
        return true;
      }
      // Se a data de hoje está dentro do período de afastamento, ele está ausente AGORA
      if (hoje.getTime() >= dataInicio.getTime() && hoje.getTime() <= dataFim.getTime()) {
        return true;
      }
      return false;
    }

    if (dataInicio && !dataFim) {
      return dataAlvo.getTime() >= dataInicio.getTime() || hoje.getTime() >= dataInicio.getTime();
    }

    if (!dataInicio && dataFim) {
      return dataAlvo.getTime() <= dataFim.getTime();
    }

    // Sem datas definidas, ausente flag direto é TRUE
    return true;
  }

  // Mesmo que ausenteFlag não esteja setada explicitamente, se houver período ativo e cair no dia
  if (dataInicio && dataFim) {
    if (dataAlvo.getTime() >= dataInicio.getTime() && dataAlvo.getTime() <= dataFim.getTime()) {
      return true;
    }
    if (hoje.getTime() >= dataInicio.getTime() && hoje.getTime() <= dataFim.getTime()) {
      return true;
    }
  }

  return false;
}

/**
 * Retorna mensagem descritiva sobre o afastamento do colaborador
 */
export function getDescricaoAusencia(user: UserAusenciaInfo): string {
  const nome = user.nome || 'Colaborador';
  const tipo = user.ausente_tipo || user.ausenteTipo || 'Afastado';
  const dataInicio = parseDateFlexible(user.ausente_inicio || user.ausenteInicio);
  const dataFim = parseDateFlexible(user.ausente_fim || user.ausenteFim);

  let periodoTexto = '';
  if (dataInicio && dataFim) {
    periodoTexto = ` de ${formatToDateBr(dataInicio)} até ${formatToDateBr(dataFim)}`;
  } else if (dataInicio) {
    periodoTexto = ` a partir de ${formatToDateBr(dataInicio)}`;
  } else if (dataFim) {
    periodoTexto = ` até ${formatToDateBr(dataFim)}`;
  }

  const motivo = user.ausente_motivo || user.ausenteMotivo;
  const motivoTexto = motivo ? ` (Motivo: ${motivo})` : '';

  return `${nome} está ausente (${tipo})${periodoTexto}${motivoTexto}.`;
}
