function gerarId(linhas) {
  if (!Array.isArray(linhas) || linhas.length === 0) return '001';

  let maior = 0;

  for (const linha of linhas) {
    const bruto = Array.isArray(linha) ? linha[0] : null;
    const somenteDigitos = String(bruto || '').replace(/\D/g, '');

    if (!somenteDigitos) continue;

    const numero = Number.parseInt(somenteDigitos, 10);
    if (Number.isNaN(numero)) continue;

    if (numero > maior) {
      maior = numero;
    }
  }

  return String(maior + 1).padStart(3, '0');
}

module.exports = gerarId;
