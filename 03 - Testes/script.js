// --- Inicialização do mapa ---
const map = L.map('map').setView([-14.235, -51.9253], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// --- Ícones personalizados ---
const iconAberto = L.icon({
  iconUrl: 'imgs/pin.png',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
  popupAnchor: [1, -14]
});
const iconFechado = L.icon({
  iconUrl: 'imgs/pin-error.png',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
  popupAnchor: [1, -14]
});
const iconManual = L.icon({
  iconUrl: 'imgs/pin-uncheck.png',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
  popupAnchor: [1, -14]
});
const iconWarn = L.icon({
  iconUrl: 'imgs/pin-warn.png',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
  popupAnchor: [1, -14]
});

// --- Mapa de siglas para nomes completos dos estados ---
const estadosMap = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas",
  BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
  GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
  SP: "São Paulo", SE: "Sergipe", TO: "Tocantins"
};

// --- Variáveis globais ---
let dadosMuseus = [];
let dadosEnderecos = [];
let dadosAcessibilidade = [];
let dadosTematica = [];
const marcadores = []; 
let marcadoresVisiveis = L.featureGroup().addTo(map);
let choicesUF, choicesAcessibilidade, choicesTematica, fuse;
let titulosUnicos = [];

// Elementos do loading
const loadingOverlay = document.getElementById('loading-overlay');
const progressBar = document.getElementById('progress-bar');
const loadingText = document.querySelector('.loading-text');

// --- Funções para controlar o loading ---
function showLoading(text = 'Carregando dados...', progress = 0) {
  loadingText.textContent = text;
  progressBar.style.width = `${progress}%`;
  loadingOverlay.classList.remove('hidden');
}

function updateProgress(progress, text = null) {
  setTimeout(() => {
    progressBar.style.width = `${progress}%`;
    if (text) loadingText.textContent = text;
  }, 50);
}

function hideLoading() {
  setTimeout(() => {
    loadingOverlay.classList.add('hidden');
  }, 200);
}

// --- Função para escapar HTML (para destacar texto) ---
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, function (m) {
    return ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;',
      '"': '&quot;', "'": '&#39;'
    })[m];
  });
}

// --- Cria marcadores no mapa ---
function criarMarcadores() {
  marcadoresVisiveis.clearLayers();
  marcadores.length = 0;

  dadosMuseus.forEach(museu => {
    const endereco = dadosEnderecos.find(e => e.ID === museu.ID);
    const acess = dadosAcessibilidade.find(a => a.ID === museu.ID);
    const tematica = dadosTematica.find(t => t.ID === museu.ID);
    
    // Adicionado tratamento para museus sem endereço ou localização
    if (!endereco || !endereco.Localização) {
      console.warn(`Museu com ID ${museu.ID} sem dados de endereço ou localização. Ignorando.`);
      return;
    }

    const local = (endereco.Localização || '').replace(/"/g, '').trim();
    const match = local.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
    
    // Adicionado tratamento para localização inválida
    if (!match || match.length < 3) {
      console.warn(`Museu com ID ${museu.ID} tem localização inválida: "${endereco.Localização}". Ignorando.`);
      return;
    }

    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);

    // Adicionado tratamento para coordenadas NaN
    if (isNaN(lat) || isNaN(lng)) {
        console.warn(`Museu com ID ${museu.ID} tem coordenadas inválidas (NaN): Latitude=${match[1]}, Longitude=${match[2]}. Ignorando.`);
        return;
    }

    const status = (museu['Status do Museu'] || '').toLowerCase().trim();
    const geoManual = (endereco['Geolocalização manual'] || '').toLowerCase();
    
    // Lógica para verificar acessibilidade (todos 0 ou "0")
    const recursosAcessibilidade = [];
    let possuiQualquerAcessibilidade = false;
    if (acess) {
      Object.entries(acess).forEach(([chave, valor]) => {
        const valorNumerico = parseInt(valor, 10);
        if (chave !== 'ID' && valorNumerico === 1) { // Verifica se é 1 (true para acessibilidade)
          recursosAcessibilidade.push(chave);
          possuiQualquerAcessibilidade = true;
        }
      });
    }

    let icon; // Declara a variável icon aqui

    // LÓGICA DE PRIORIDADE: pin-error > pin-warn > pin-uncheck > pin.png
    if (status === 'fechado') { // Prioridade 1: Status do museu (fechado)
        icon = iconFechado;
    } else if (!possuiQualquerAcessibilidade) { // Prioridade 2: Sem acessibilidade (todos 0 ou "0")
        icon = iconWarn;
    } else if (geoManual === 'true') { // Prioridade 3: Geolocalização manual
        icon = iconManual;
    } else { // Padrão: Aberto e com alguma acessibilidade ou sem condição especial
        icon = iconAberto;
    }

    const statusBadge = status === 'fechado'
      ? '<span class="badge badge-vermelho">Inativo</span>'
      : '<span class="badge badge-azul">Funcionando</span>';

    const geoBadge = geoManual === 'true'
      ? '<span class="badge badge-laranja">Localização imprecisa no mapa</span>' : '';

    // Lógica ATUALIZADA para o badge "Sem acessibilidade":
    // O badge aparece SEMPRE que o museu não tiver acessibilidade, independente do pin
    let acessBadgeHtml = '';
    if (!possuiQualquerAcessibilidade) { 
        acessBadgeHtml = '<span class="badge badge-amarelo">Sem acessibilidade</span>';
    }


    const enderecoCompleto = [
      endereco.Logradouro, endereco.Número, endereco.Complemento,
      endereco.Bairro, endereco.CEP, `${endereco.Município} - ${endereco.UF}`
    ].filter(Boolean).join(', ');

    const acessInfo = recursosAcessibilidade.length
      ? `<div class="popup-info"><strong>Acessibilidade:</strong> ${recursosAcessibilidade.join(', ')}</div>`
      : `<div class="popup-info"><strong>Acessibilidade:</strong> Sem recursos de acessibilidade.</div>`;

    const temasMuseu = []; // Garante que temasMuseu está inicializado
    if (tematica) {
      Object.entries(tematica).forEach(([chave, valor]) => {
        const valorNumerico = parseInt(valor, 10);
        if (chave !== 'ID' && chave !== 'Não disponível' && chave !== 'Não informado' && valorNumerico === 1) {
          temasMuseu.push(chave);
        }
      });
    }

    const tematicaInfo = temasMuseu.length
      ? `<div class="popup-info"><strong>Temática:</strong> ${temasMuseu.join(', ')}</div>`
      : '';

    const popupContent = `
      <div class="popup-title">${escapeHtml(museu['Título'])}</div>
      <div class="popup-info">
        ${statusBadge} ${geoBadge} ${acessBadgeHtml}
      </div>
      <div class="popup-info"><strong>Endereço:</strong> ${escapeHtml(enderecoCompleto)}</div>
      ${acessInfo}
      ${tematicaInfo}
    `;

    const marker = L.marker([lat, lng], { icon }).bindPopup(popupContent);

    marcadores.push({
      marker,
      status,
      uf: endereco.UF,
      nome: (museu['Título'] || '').toLowerCase(),
      acess: recursosAcessibilidade,
      possuiQualquerAcessibilidade: possuiQualquerAcessibilidade,
      tematica: temasMuseu,
      lat,
      lng
    });
  });

  aplicarFiltros();
}

// --- Aplica os filtros (status, UF, nome, acessibilidade e temática) ---
// Modifique a assinatura da função para aceitar uma callback
function aplicarFiltros(callback = null) { // Adicione 'callback = null' como parâmetro
  showLoading('Aplicando filtros...', 0);

  setTimeout(() => {
    marcadoresVisiveis.clearLayers();

    const statusSelecionado = document.querySelector('input[name="status"]:checked').value;
    const ufsSelecionadas = choicesUF.getValue(true);
    const acessSelecionadas = choicesAcessibilidade.getValue(true);
    const tematicaSelecionadas = choicesTematica.getValue(true);
    const inputNome = document.getElementById('filtro-nome');
    const nomeSelecionado = inputNome.value.trim().toLowerCase();

    const filtrarPorNaoPossuiAcessibilidade = acessSelecionadas.includes('Não possui');
    const acessRecursosSelecionados = acessSelecionadas.filter(f => f !== 'Não possui');


    const visiveisBounds = [];
    let processedCount = 0;
    const totalMarkers = marcadores.length;

    function processChunk() {
      const chunkSize = 200;
      const endIndex = Math.min(processedCount + chunkSize, totalMarkers);

      for (let i = processedCount; i < endIndex; i++) {
        const { marker, status, uf, nome, acess, possuiQualquerAcessibilidade, tematica, lat, lng } = marcadores[i];

        const correspondeStatus =
          statusSelecionado === 'todos' ||
          (statusSelecionado === 'funcionando' && status === 'aberto') ||
          (statusSelecionado === 'nao-funcionando' && status === 'fechado');

        const correspondeUF =
          ufsSelecionadas.length === 0 || ufsSelecionadas.includes(uf);

        const correspondeNome =
          nomeSelecionado === '' || nome.includes(nomeSelecionado);

        let correspondeAcess;
        if (filtrarPorNaoPossuiAcessibilidade) {
          correspondeAcess = !possuiQualquerAcessibilidade;
        } else {
          correspondeAcess =
            acessRecursosSelecionados.length === 0 || acessRecursosSelecionados.every(f => acess.includes(f));
        }


        const correspondeTematica =
          tematicaSelecionadas.length === 0 || tematicaSelecionadas.every(t => tematica.includes(t));

        if (correspondeStatus && correspondeUF && correspondeNome && correspondeAcess && correspondeTematica) {
          marcadoresVisiveis.addLayer(marker);
          visiveisBounds.push([lat, lng]);
        }
      }

      processedCount = endIndex;
      updateProgress(Math.floor((processedCount / totalMarkers) * 100), 'Filtrando museus...');

      if (processedCount < totalMarkers) {
        requestAnimationFrame(processChunk);
      } else {
        if (visiveisBounds.length > 0) {
          const bounds = L.latLngBounds(visiveisBounds);
          map.fitBounds(bounds, { padding: [30, 30] });
        } else {
          map.setView([-14.235, -51.9253], 4);
        }
        hideLoading();
        // Chame a callback APENAS QUANDO a filtragem e atualização do mapa estiverem COMPLETAS
        if (callback) {
          callback();
        }
      }
    }
    requestAnimationFrame(processChunk);
  }, 0);
}


// --- Eventos do filtro status ---
document.querySelectorAll('input[name="status"]').forEach(radio => {
  radio.addEventListener('change', aplicarFiltros);
});

// --- Carregar CSVs ---
showLoading('Preparando...', 0);
Promise.all([
  new Promise(res => Papa.parse('main.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: result => {
      updateProgress(20, 'Carregando Museus...');
      res(result.data.map(d => ({ ...d, ID: d.ID.trim() })));
    }
  })),
  new Promise(res => Papa.parse('endereco_museus.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: result => {
      updateProgress(40, 'Carregando Endereços...');
      res(result.data.map(d => ({ ...d, ID: d.ID.trim() })));
    }
  })),
  new Promise(res => Papa.parse('filtro_infra_recursos_acessibilidade.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: result => {
      updateProgress(60, 'Carregando Acessibilidade...');
      res(result.data.map(d => ({ ...d, ID: d.ID.trim() })));
    }
  })),
  new Promise(res => Papa.parse('tematica_museu.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: result => {
      updateProgress(80, 'Carregando Temáticas...');
      res(result.data.map(d => ({ ...d, ID: d.ID.trim() })));
    }
  }))
]).then(([museus, enderecos, acessibilidade, tematica]) => {
  dadosMuseus = museus;
  dadosEnderecos = enderecos;
  dadosAcessibilidade = acessibilidade;
  dadosTematica = tematica;

  updateProgress(90, 'Inicializando filtros...');

  // --- Preenche filtro UF ---
  const selectUF = document.getElementById('filtro-uf');
  const ufsUnicas = [...new Set(enderecos.map(e => e.UF).filter(Boolean))].sort();
  const optionsUF = ufsUnicas.map(sigla => ({
    value: sigla,
    label: estadosMap[sigla] || sigla
  }));
  choicesUF = new Choices(selectUF, {
    choices: optionsUF,
    removeItemButton: true,
    placeholderValue: 'Selecione estados...',
    searchPlaceholderValue: 'Buscar estado...',
    itemSelectText: '',
    noResultsText: 'Nenhum estado encontrado'
  });
  choicesUF.passedElement.element.addEventListener('change', () => {
    aplicarFiltros();
    choicesUF.hideDropdown();
  });

  // --- Preenche filtro acessibilidade ---
  const selectAcess = document.getElementById('filtro-acessibilidade');

  const todasChavesAcessibilidade = Object.keys(acessibilidade[0]).filter(c => 
    c !== 'ID' && 
    c.trim() !== '' && 
    !c.toLowerCase().includes('não possui') 
  );

  const optionsAcess = [{ value: 'Não possui', label: 'Não possui' }];
  
  todasChavesAcessibilidade.forEach(item => {
    optionsAcess.push({ value: item, label: item });
  });

  choicesAcessibilidade = new Choices(selectAcess, {
    choices: optionsAcess,
    removeItemButton: true,
    placeholderValue: 'Infraestrutura e recursos...',
    searchPlaceholderValue: 'Buscar recurso...',
    itemSelectText: '',
    noResultsText: 'Nenhum recurso encontrado'
  });
  choicesAcessibilidade.passedElement.element.addEventListener('change', () => {
    aplicarFiltros();
    choicesAcessibilidade.hideDropdown();
  });

  // --- Preenche filtro temática ---
  const selectTematica = document.getElementById('filtro-tematica');

  const todasChavesTematica = Object.keys(tematica[0]).filter(c => c !== 'ID' && c !== 'Não disponível' && c !== 'Não informado' && c.trim() !== '');

  const optionsTematica = todasChavesTematica.map(item => ({
    value: item,
    label: item
  }));
  choicesTematica = new Choices(selectTematica, {
    choices: optionsTematica,
    removeItemButton: true,
    placeholderValue: 'Selecione...',
    searchPlaceholderValue: 'Buscar temática...',
    itemSelectText: '',
    noResultsText: 'Nenhuma temática encontrada'
  });
  choicesTematica.passedElement.element.addEventListener('change', () => {
    aplicarFiltros();
    choicesTematica.hideDropdown();
  });


  // --- Prepara lista de títulos ---
  titulosUnicos = [...new Set(museus.map(m => m['Título']).filter(Boolean))].sort();

  // --- Inicializa Fuse.js para autocomplete ---
  fuse = new Fuse(titulosUnicos.map(t => ({ title: t })), {
    includeMatches: true,
    threshold: 0.4,
    keys: ['title']
  });

  const inputNome = document.getElementById('filtro-nome');
  const autocompleteList = document.createElement('div');
  autocompleteList.setAttribute('id', 'autocomplete-list');
  autocompleteList.style.position = 'absolute';
  autocompleteList.style.border = '1px solid #d4d4d4';
  autocompleteList.style.borderTop = 'none';
  autocompleteList.style.maxHeight = '200px';
  autocompleteList.style.overflowY = 'auto';
  autocompleteList.style.backgroundColor = 'white';
  autocompleteList.style.zIndex = '1000';
  autocompleteList.style.width = inputNome.offsetWidth + 'px';
  autocompleteList.style.top = (inputNome.offsetTop + inputNome.offsetHeight) + 'px';
  autocompleteList.style.left = inputNome.offsetLeft + 'px';
  inputNome.parentNode.style.position = 'relative';
  document.querySelector('.filtro-container').appendChild(autocompleteList);

  inputNome.addEventListener('input', function () {
    const val = this.value.trim();
    autocompleteList.innerHTML = '';
    if (val.length < 3) {
      // Do NOT call aplicarFiltros here, only clear the list
      return;
    }

    const resultados = fuse.search(val, { limit: 10 });
    resultados.forEach(res => {
      const title = res.item.title;
      const matches = res.matches[0];
      let label = '';
      if (matches) {
        let lastIndex = 0;
        matches.indices.forEach(([start, end]) => {
          label += escapeHtml(title.substring(lastIndex, start));
          label += '<strong>' + escapeHtml(title.substring(start, end + 1)) + '</strong>';
          lastIndex = end + 1;
        });
        label += escapeHtml(title.substring(lastIndex));
      } else {
        label = escapeHtml(title);
      }

      const div = document.createElement('div');
      div.innerHTML = label;
      div.style.padding = '8px';
      div.style.cursor = 'pointer';
      
      div.addEventListener('click', function () {
        inputNome.value = title;
        autocompleteList.innerHTML = '';
        
        // Armazena o título selecionado para uso posterior na callback de filtros
        const tituloSelecionadoParaPopup = title.toLowerCase();

        // Modifica aplicarFiltros para aceitar uma callback opcional
        aplicarFiltros(() => {
          // Esta callback será executada DEPOIS que o mapa for atualizado e os marcadores filtrados
          const museuSelecionado = marcadores.find(m => m.nome === tituloSelecionadoParaPopup);
          if (museuSelecionado && museuSelecionado.marker) {
            // Garante que o marcador está visível no mapa antes de abrir o popup
            // Note que se ele foi filtrado para não ser visível, esta linha o adiciona.
            // Se já estava visível, não há problema.
            marcadoresVisiveis.addLayer(museuSelecionado.marker);
            map.setView(museuSelecionado.marker.getLatLng(), 15); // Centraliza e define um zoom adequado
            museuSelecionado.marker.openPopup(); // Esta linha abre o popup.
          }
        });
      });
      autocompleteList.appendChild(div);
    });
  });

  document.addEventListener('click', function (e) {
    if (e.target !== inputNome) {
      autocompleteList.innerHTML = '';
    }
  });

  // --- Cria marcadores no mapa ---
  updateProgress(100, 'Preparando mapa...');
  criarMarcadores();
}).catch(error => {
  console.error("Erro ao carregar arquivos CSV:", error);
  loadingText.textContent = 'Erro ao carregar dados. Por favor, recarregue a página.';
  progressBar.style.width = '0%';
});

// --- Botão limpar nome ---
const limparNome = document.getElementById('limpar-nome');
limparNome.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('filtro-nome').value = '';
  document.getElementById('autocomplete-list').innerHTML = '';
  aplicarFiltros(); // Não precisa de callback aqui
});