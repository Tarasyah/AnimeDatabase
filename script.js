/**
 * Anime Checklist Application - v4
 * Features: Filters (Genre, Year, Type), Grid/List View, Virtual Scroll, Modal, PDF Export
 */

const CONFIG = {
    dataSource: 'anime-offline-database-minified.json',
    listRowHeight: 80,
    gridItemHeight: 380, 
    gridMinColWidth: 200, 
    bufferRows: 4, 
};

let state = {
    allAnime: [],
    animeMap: {}, // O(1) Lookup Cache
    filteredAnime: [],
    watchedIds: new Set(),
    favoriteIds: new Set(),
    theme: 'dark', // 'dark' | 'green'
    viewMode: 'list', // 'list' | 'grid'
    
    // Filters
    filters: {
        search: '',
        genre: '',
        year: '',
        type: '',
        watched: '',
        favorite: ''
    },
    
    // Layout State
    containerWidth: 0,
    itemsPerRow: 1,
    rowHeight: CONFIG.listRowHeight,
    
    // Modal
    currentModalId: null
};

// --- DOM Cache ---
const dom = {
    scroller: document.getElementById('virtual-scroller'),
    phantom: document.getElementById('phantom-height'),
    content: document.getElementById('content-container'),
    search: document.getElementById('params-search'),
    loading: document.getElementById('loading'),
    errorScreen: document.getElementById('error-screen'),
    stats: document.getElementById('stats'),
    exportDocBtn: document.getElementById('export-doc'),
    exportPdfBtn: document.getElementById('export-pdf'),
    themeToggle: document.getElementById('theme-toggle'),
    viewListBtn: document.getElementById('view-list'),
    viewGridBtn: document.getElementById('view-grid'),
    
    // Filters
    // Filters
    // filterGenre: document.getElementById('filter-genre'), // Removed
    genreTrigger: document.getElementById('genre-trigger'),
    genreLabel: document.getElementById('genre-label'),
    genreMenu: document.getElementById('genre-menu'),
    genreSearchInput: document.getElementById('genre-search-input'),
    genreList: document.getElementById('genre-list'),
    
    filterYear: document.getElementById('filter-year'),
    filterType: document.getElementById('filter-type'),
    filterWatched: document.getElementById('filter-watched'),
    filterFavorite: document.getElementById('filter-favorite'),
    resetFiltersBtn: document.getElementById('reset-filters'),
    clearProgressBtn: document.getElementById('clear-progress'),
    
    filterBar: document.getElementById('filter-bar'),
    exportTarget: document.getElementById('export-target'),
    
    // Modal
    modalBackdrop: document.getElementById('modal-backdrop'),
    modalContent: document.getElementById('modal-content'),
    modalTitle: document.getElementById('modal-title'),
    modalSubtitle: document.getElementById('modal-subtitle'),
    modalImg: document.getElementById('modal-img'),
    modalTags: document.getElementById('modal-tags'),
    modalLinks: document.getElementById('modal-links'),
    modalBadge: document.getElementById('modal-status-badge'),
    modalCheck: document.getElementById('modal-check'),
    modalFavoriteCheck: document.getElementById('modal-favorite-check'),
    closeModal: document.getElementById('close-modal'),
    
    // Detailed Info Elements
    modalStatus: document.getElementById('modal-status'),
    modalEpisodes: document.getElementById('modal-episodes'),
    modalSeason: document.getElementById('modal-season'),
    modalStudio: document.getElementById('modal-studio'),
    modalScore: document.getElementById('modal-score'),
    modalSynonyms: document.getElementById('modal-synonyms'),
    modalSynonymsContainer: document.getElementById('modal-synonyms-container'),
    modalRelations: document.getElementById('modal-relations'),
    modalRelationsContainer: document.getElementById('modal-relations-container'),
    
    html: document.documentElement,
    body: document.body,
    header: document.getElementById('header')
};

// --- Init ---
async function init() {
    loadSettings();
    applyTheme();
    updateViewToggles();

    try {
        const response = await fetch(CONFIG.dataSource);
        if (!response.ok) throw new Error('File not found');
        const json = await response.json();
        
        // --- NSFW & Content Filter ---
        const blacklist = ['hentai', 'ecchi', 'erotica', 'hentai', 'borderline porn', 'promotional', 'anime influenced', 'kids', 'boys love', 'yaoi', 'shounen ai'];
        const minYear = 2007;
        const cleanData = json.data.filter(item => {
            // NSFW & Promotional Check
            const tags = item.tags ? item.tags.map(t => t.toLowerCase()) : [];
            const isBlacklisted = tags.some(tag => blacklist.some(b => tag.includes(b)));
            if (isBlacklisted) return false;

            // Year Check - exclude anything before 2007
            const itemYear = item.animeSeason ? item.animeSeason.year : null;
            if (itemYear && itemYear < minYear) return false;
            if (!itemYear) return false; 

            return true;
        });

        state.allAnime = cleanData.map((item, index) => ({
            id: index, 
            title: item.title,
            picture: item.picture,
            type: item.type,
            episodes: item.episodes,
            year: item.animeSeason ? item.animeSeason.year : '-',
            season: item.animeSeason ? item.animeSeason.season : '',
            tags: item.tags || [],
            sources: item.sources || [],
            relations: item.relations || item.relatedAnime || [], // fallback to relatedAnime
            synonyms: item.synonyms || [],
            status: item.status || 'UNKNOWN',
            studios: item.studios || [],
            thumbnail: item.thumbnail
        }));

        // Populate Lookup Map for O(1) Access
        state.allAnime.forEach(anime => {
            state.animeMap[anime.id] = anime;
        });

        populateFilters();
        applyFilters();
        
        dom.loading.classList.add('hidden');
        handleResize();
        
        // Listeners
        dom.scroller.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', debounce(handleResize, 100));
        
        // Search & Filter Events
        dom.search.addEventListener('input', debounce((e) => {
            state.filters.search = e.target.value;
            applyFilters();
        }, 300));
        
        // Custom Genre Dropdown Listeners
        dom.genreTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.genreMenu.classList.toggle('hidden');
            dom.genreSearchInput.focus();
        });
        
        dom.genreSearchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const options = dom.genreList.querySelectorAll('.genre-option');
            options.forEach(opt => {
                const text = opt.textContent.toLowerCase();
                opt.style.display = text.includes(term) ? 'block' : 'none';
            });
        });

        document.addEventListener('click', (e) => {
            if (!dom.genreTrigger.contains(e.target) && !dom.genreMenu.contains(e.target)) {
                dom.genreMenu.classList.add('hidden');
            }
        });
        
        dom.filterYear.addEventListener('change', (e) => { state.filters.year = e.target.value; applyFilters(); });
        dom.filterType.addEventListener('change', (e) => { state.filters.type = e.target.value; applyFilters(); });
        dom.filterWatched.addEventListener('change', (e) => { state.filters.watched = e.target.value; applyFilters(); });
        dom.filterFavorite.addEventListener('change', (e) => { state.filters.favorite = e.target.value; applyFilters(); });
        dom.resetFiltersBtn.addEventListener('click', resetFilters);
        dom.clearProgressBtn.addEventListener('click', clearProgress);
        
        dom.exportDocBtn.addEventListener('click', exportWord);
        dom.exportPdfBtn.addEventListener('click', exportPdf);
        
        dom.themeToggle.addEventListener('click', toggleTheme);
        dom.viewListBtn.addEventListener('click', () => switchView('list'));
        dom.viewGridBtn.addEventListener('click', () => switchView('grid'));

        // Modal Listeners
        dom.closeModal.addEventListener('click', closeModal);
        dom.modalBackdrop.addEventListener('click', (e) => {
            if (e.target === dom.modalBackdrop) closeModal();
        });
        dom.modalCheck.addEventListener('change', (e) => {
            if (state.currentModalId !== null) {
                toggleWatched(state.currentModalId, e.target.checked);
            }
        });
        dom.modalFavoriteCheck.addEventListener('change', (e) => {
            if (state.currentModalId !== null) {
                toggleFavorite(state.currentModalId, e.target.checked);
            }
        });
        
        updateStats();

    } catch (err) {
        console.error(err);
        dom.loading.classList.add('hidden');
        dom.errorScreen.classList.remove('hidden');
    }
}

// --- Filter Logic ---

function populateFilters() {
    const genres = new Set();
    const years = new Set();
    
    state.allAnime.forEach(item => {
        if (item.tags) item.tags.forEach(t => genres.add(t));
        if (item.year && item.year !== '-') years.add(item.year);
    });
    
    // Sort and Populate Genres (CUSTOM DROPDOWN)
    const sortedGenres = Array.from(genres).sort();
    
    // Add "All Genres" Option
    const allOpt = document.createElement('div');
    allOpt.className = 'genre-option px-3 py-2 text-xs text-gray-300 hover:bg-white/10 cursor-pointer border-b border-dark-border/50';
    allOpt.textContent = 'All Genres';
    allOpt.onclick = () => selectGenre('');
    dom.genreList.appendChild(allOpt);

    sortedGenres.forEach(g => {
        const opt = document.createElement('div');
        opt.className = 'genre-option px-3 py-2 text-xs text-gray-300 hover:bg-white/10 cursor-pointer';
        opt.textContent = g;
        opt.onclick = () => selectGenre(g);
        dom.genreList.appendChild(opt);
    });
    
    // Sort and Populate Years (Desc)
    const sortedYears = Array.from(years).sort((a,b) => b - a);
    sortedYears.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        dom.filterYear.appendChild(opt);
    });
}

function applyFilters() {
    const { search, genre, year, type, watched } = state.filters;
    const q = search.toLowerCase().trim();
    
    state.filteredAnime = state.allAnime.filter(a => {
        const matchesSearch = !q || a.title.toLowerCase().includes(q);
        const matchesGenre = !genre || (a.tags && a.tags.includes(genre));
        const matchesYear = !year || a.year == year;
        const matchesType = !type || a.type === type;

        const matchesWatched = !watched || (watched === 'watched' ? state.watchedIds.has(a.id) : !state.watchedIds.has(a.id));
        const matchesFavorite = !state.filters.favorite || state.favoriteIds.has(a.id);
        
        return matchesSearch && matchesGenre && matchesYear && matchesType && matchesWatched && matchesFavorite;
    });
    
    dom.scroller.scrollTop = 0;
    renderVirtualList(true);
    updateStats();
}

function selectGenre(genre) {
    state.filters.genre = genre;
    dom.genreLabel.textContent = genre || 'All Genres';
    dom.genreMenu.classList.add('hidden');
    dom.genreLabel.classList.toggle('text-white', !!genre); // Highlight if selected
    applyFilters();
}

function resetFilters() {
    state.filters = { search: '', genre: '', year: '', type: '', watched: '', favorite: '' };
    dom.search.value = '';
    
    // Reset Custom Genre
    selectGenre('');
    dom.genreSearchInput.value = '';
    dom.genreList.querySelectorAll('.genre-option').forEach(opt => opt.style.display = 'block');

    dom.filterYear.value = '';
    dom.filterType.value = '';
    dom.filterWatched.value = '';
    dom.filterFavorite.value = '';
    applyFilters();
}

function clearProgress() {
    if (confirm("Are you sure you want to clear all watched anime? This cannot be undone.")) {
        state.watchedIds.clear();
        saveSettings();
        updateStats();
        renderVirtualList();
        if (state.currentModalId !== null) dom.modalCheck.checked = false;
    }
}

// --- Layout & Rendering ---

function handleResize() {
    state.containerWidth = dom.scroller.clientWidth;
    
    if (state.viewMode === 'grid') {
        const cols = Math.floor(state.containerWidth / CONFIG.gridMinColWidth);
        state.itemsPerRow = Math.max(2, cols); 
        if (state.containerWidth < 400) state.itemsPerRow = 2; 
        state.rowHeight = CONFIG.gridItemHeight;
    } else {
        state.itemsPerRow = 1;
        state.rowHeight = CONFIG.listRowHeight;
    }
    
    renderVirtualList(true);
}

function switchView(mode) {
    if (state.viewMode === mode) return;
    state.viewMode = mode;
    saveSettings();
    updateViewToggles();
    dom.scroller.scrollTop = 0;
    handleResize();
}

function updateViewToggles() {
    const activeClass = 'bg-gray-700/50 text-white';
    if (state.viewMode === 'list') {
        dom.viewListBtn.classList.add(...activeClass.split(' '));
        dom.viewListBtn.classList.remove('text-gray-400');
        dom.viewGridBtn.classList.remove(...activeClass.split(' '));
        dom.viewGridBtn.classList.add('text-gray-400');
    } else {
        dom.viewGridBtn.classList.add(...activeClass.split(' '));
        dom.viewGridBtn.classList.remove('text-gray-400');
        dom.viewListBtn.classList.remove(...activeClass.split(' '));
        dom.viewListBtn.classList.add('text-gray-400');
    }
}

function renderVirtualList(force = false) {
    const totalItems = state.filteredAnime.length;
    const totalRows = Math.ceil(totalItems / state.itemsPerRow);
    const totalHeight = totalRows * state.rowHeight;
    dom.phantom.style.height = `${totalHeight}px`;

    const viewHeight = dom.scroller.clientHeight;
    const scrollTop = dom.scroller.scrollTop;

    const startRow = Math.floor(scrollTop / state.rowHeight);
    const endRow = Math.min(
        totalRows - 1,
        Math.floor((scrollTop + viewHeight) / state.rowHeight) + CONFIG.bufferRows
    );
    const renderStartRow = Math.max(0, startRow - CONFIG.bufferRows);

    let html = '';
    for (let r = renderStartRow; r <= endRow; r++) {
        const rowTop = r * state.rowHeight;
        const startIndex = r * state.itemsPerRow;
        const endIndex = Math.min(startIndex + state.itemsPerRow, totalItems);
        
        let rowContent = '';
        for (let i = startIndex; i < endIndex; i++) {
            const item = state.filteredAnime[i];
            const isWatched = state.watchedIds.has(item.id);
            const isFavorite = state.favoriteIds.has(item.id);
            rowContent += createItemHTML(item, isWatched, isFavorite);
        }
        
        html += `
            <div class="absolute left-0 right-0 grid gap-4 px-2 md:px-0"
                style="top: ${rowTop}px; height: ${state.rowHeight}px; grid-template-columns: repeat(${state.itemsPerRow}, minmax(0, 1fr));">
                ${rowContent}
            </div>
        `;
    }
    dom.content.innerHTML = html;
}

function createItemHTML(item, isWatched, isFavorite) {
    const safeTitle = escapeHtml(item.title);
    const isGreen = state.theme === 'green';
    
    // Heart Icon
    const heartClass = isFavorite ? 'text-red-500 fill-current' : 'text-gray-400 hover:text-red-500';
    const heartPath = isFavorite 
        ? '<path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />';
    
    // Improved Image logic: show "No Image" if picture is missing or fails
    const imageHTML = item.picture 
        ? `<img src="${item.picture}" loading="lazy" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<div class=\'no-image-placeholder\'>No Image</div>'">`
        : `<div class="no-image-placeholder">No Image</div>`;

    if (state.viewMode === 'list') {
        // Theme Colors (Matches 'Evergreen' vs 'Moon')
        const greenBase = isGreen ? 'border-[#1E5740] hover:bg-[#124734]' : 'border-dark-border hover:bg-dark-hover';
        const greenWatched = isGreen ? 'bg-[#6EE7B7]/20 border-[#6EE7B7]/30' : 'bg-[#7B337E]/20 border-[#7B337E]/30';
        
        return `
            <div class="col-span-full h-full flex items-center px-4 md:px-6 border-b transition-colors cursor-pointer group
                ${isWatched ? greenWatched : greenBase}
                ${isGreen ? 'border-[#1E5740]' : 'border-dark-border'}
                "
                onclick="openModal(${item.id})"
            >
                <div class="flex-shrink-0 mr-4" onclick="event.stopPropagation()">
                    <input type="checkbox" 
                        class="w-5 h-5 rounded border-gray-600 focus:ring-offset-0 cursor-pointer accent-[#6EE7B7] dark:accent-[#7B337E]"
                        ${isWatched ? 'checked' : ''}
                        onchange="toggleWatched(${item.id}, this.checked)"
                    >
                </div>
                 <div class="flex-shrink-0 mr-4 cursor-pointer" onclick="event.stopPropagation(); toggleFavorite(${item.id}, ${!isFavorite})">
                    <svg class="w-6 h-6 transition-colors ${heartClass}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        ${heartPath}
                    </svg>
                </div>
                <div class="hidden md:block flex-shrink-0 mr-4 w-[45px] h-[65px] bg-gray-800 rounded overflow-hidden">
                    ${imageHTML}
                </div>
                <div class="flex-grow min-w-0">
                    <h3 class="font-medium text-sm truncate ${isWatched ? 'opacity-60 line-through' : ''}">${safeTitle}</h3>
                    <div class="flex items-center gap-2 mt-1 opacity-60">
                        <span class="text-[10px] px-1 rounded border border-current">${item.type || 'TV'}</span>
                        <span class="text-[10px]">${item.year}</span>
                    </div>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="h-[360px] md:h-[360px] flex flex-col p-2 rounded-lg transition-transform hover:scale-[1.02] cursor-pointer relative group
                ${isWatched ? 'opacity-60 grayscale-[0.5]' : ''}
                "
                onclick="openModal(${item.id})"
            >
                <div class="relative w-full aspect-[2/3] rounded-lg overflow-hidden shadow-lg bg-gray-800 mb-3">
                    ${imageHTML}
                    <div class="absolute top-2 right-2 flex gap-2" onclick="event.stopPropagation()">
                         <button onclick="toggleFavorite(${item.id}, ${!isFavorite})" class="p-1 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-colors">
                            <svg class="w-5 h-5 ${heartClass}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                ${heartPath}
                            </svg>
                        </button>
                        <input type="checkbox" 
                            class="w-6 h-6 rounded border-gray-400 bg-black/50 text-green-500 focus:ring-0 cursor-pointer backdrop-blur-sm"
                            ${isWatched ? 'checked' : ''}
                            onchange="toggleWatched(${item.id}, this.checked)"
                        >
                    </div>
                    ${item.episodes ? `<div class="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 text-white text-[10px] font-bold rounded backdrop-blur-sm">${item.episodes} EP</div>` : ''}
                </div>
                <div class="flex flex-col gap-1 min-h-0">
                    <h3 class="font-medium text-sm leading-tight line-clamp-2" title="${safeTitle}">${safeTitle}</h3>
                    <div class="flex items-center gap-2 text-xs opacity-60 mt-auto">
                        <span>${item.year}</span>
                        <span>•</span>
                        <span>${item.type || 'TV'}</span>
                    </div>
                </div>
            </div>
        `;
    }
}

// --- Logic ---

function handleScroll() {
    requestAnimationFrame(() => renderVirtualList());
}

window.toggleWatched = function(id, status) {
    if (status) state.watchedIds.add(id);
    else state.watchedIds.delete(id);
    
    if (state.currentModalId === id) dom.modalCheck.checked = status;

    saveSettings();
    updateStats();
    
    // If we are filtering by "Watched" or "Unwatched", we need to re-apply filters
    if (state.filters.watched) {
        applyFilters();
    } else {
        renderVirtualList();
    }
};

window.toggleFavorite = function(id, status) {
    if (status) state.favoriteIds.add(id);
    else state.favoriteIds.delete(id);
    
    if (state.currentModalId === id) dom.modalFavoriteCheck.checked = status;

    saveSettings();
    updateStats(); // Update stats to reflect favorite changes if we track them, or just general updates
    
    // If we are filtering by Favorites, we need to re-apply filters
    if (state.filters.favorite) {
        applyFilters();
    } else {
        renderVirtualList();
    }
};

window.openModal = function(id) {
    // Instant O(1) Lookup using Map
    const item = state.animeMap[id];
    
    if (!item) {
        console.error("Anime not found in map:", id);
        return;
    }

    state.currentModalId = id;

    dom.modalTitle.textContent = item.title;
    dom.modalSubtitle.textContent = `${item.year} • ${item.episodes || '?'} Episodes • ${item.season || ''}`;
    dom.modalBadge.textContent = item.type || 'TV';
    
    // Proper image handling without losing gradient overlay
    const imgWrapper = dom.modalImg.parentElement;
    
    // Improved Image Rendering: Blurred Background + Contained Image
    if (item.picture) {
        imgWrapper.innerHTML = `
            <div class="absolute inset-0 bg-cover bg-center blur-md opacity-50" style="background-image: url('${item.picture}')"></div>
            <div class="absolute inset-0 bg-black/30"></div>
            <img id="modal-img" src="${item.picture}" class="relative w-full h-full object-contain z-10 p-2" onerror="this.parentElement.innerHTML='<div class=\'no-image-placeholder\'>No Image</div>'">
        `;
    } else {
        imgWrapper.innerHTML = `
            <div class="no-image-placeholder">No Image</div>
        `;
    }
    
    // RE-CACHE the image element reference
    dom.modalImg = document.getElementById('modal-img');

    dom.modalCheck.checked = state.watchedIds.has(id);
    dom.modalFavoriteCheck.checked = state.favoriteIds.has(id);

    // Detailed Info
    dom.modalStatus.textContent = item.status;
    dom.modalEpisodes.textContent = item.episodes || 'N/A';
    dom.modalSeason.textContent = `${item.season || ''} ${item.year || ''}`.trim() || 'N/A';
    dom.modalStudio.textContent = (item.studios && item.studios.length > 0) ? item.studios.join(', ') : 'N/A';
    
    // Synonyms and Score removed as requested
    dom.modalSynonymsContainer.classList.add('hidden');

    // Tags
    dom.modalTags.innerHTML = item.tags.map(tag => 
        `<span class="px-2 py-1 bg-white/10 rounded text-xs text-gray-300 border border-white/5">${tag}</span>`
    ).join('');

    // Relations
    if (item.relations && item.relations.length > 0) {
        dom.modalRelations.innerHTML = item.relations.map(rel => {
            try {
                const url = new URL(rel);
                const host = url.hostname.replace('www.', '');
                return `<p class="flex items-center gap-2">
                            <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            <a href="${rel}" target="_blank" class="hover:underline opacity-80">${host} Link</a>
                        </p>`;
            } catch(e) {
                return `<p class="flex items-center gap-2 opacity-60">• ${rel}</p>`;
            }
        }).join('');
        dom.modalRelationsContainer.classList.remove('hidden');
    } else {
        dom.modalRelationsContainer.classList.add('hidden');
    }

    // Links
    if (item.sources && item.sources.length > 0) {
        dom.modalLinks.innerHTML = item.sources.map(src => {
            try { 
                const url = new URL(src);
                return `<a href="${src}" target="_blank" class="flex items-center gap-1 hover:underline opacity-80 hover:opacity-100">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                            ${url.hostname.replace('www.', '')}
                        </a>`; 
            }
            catch(e) { return `<a href="${src}" target="_blank" class="hover:underline opacity-80 hover:opacity-100">Link</a>`; }
        }).join('');
    } else {
        dom.modalLinks.innerHTML = '<span class="text-gray-600 font-italic">No official links available</span>';
    }

    dom.modalBackdrop.classList.remove('hidden');
    void dom.modalContent.offsetWidth;
    dom.modalContent.classList.remove('scale-95', 'opacity-0');
    dom.modalContent.classList.add('scale-100', 'opacity-100');
};

window.closeModal = function() {
    dom.modalContent.classList.remove('scale-100', 'opacity-100');
    dom.modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        dom.modalBackdrop.classList.add('hidden');
        state.currentModalId = null;
    }, 200);
};

function updateStats() {
    const total = state.allAnime.length;
    const filtered = state.filteredAnime.length;
    const watched = state.watchedIds.size;
    dom.stats.innerHTML = `<span class="text-green-500 font-bold">${watched}</span> / ${total} Watched • ${filtered.toLocaleString()} results`;
}

// --- Export ---

async function exportWord() {
    const target = dom.exportTarget.value; // 'watched' | 'favorites'
    
    let items = [];
    let title = "";
    let filename = "";

    if (target === 'favorites') {
        items = state.allAnime.filter(a => state.favoriteIds.has(a.id));
        title = "My Favorite Anime List";
        filename = "anime_favorite_list";
        if (items.length === 0) { alert("No favorite anime to export!"); return; }
    } else {
        items = state.allAnime.filter(a => state.watchedIds.has(a.id));
        title = "My Watched Anime List";
        filename = "anime_watched_list";
        if (items.length === 0) { alert("No watched anime to export!"); return; }
    }
    
    const originalText = dom.exportDocBtn.innerHTML;
    dom.exportDocBtn.disabled = true;
    dom.exportDocBtn.innerHTML = `<span class="animate-pulse">Generating...</span>`;
    
    try {
        await generateWord(items, title, filename);
    } catch (e) {
        console.error(e);
        alert("Failed to generate Word document");
    } finally {
        dom.exportDocBtn.disabled = false;
        dom.exportDocBtn.innerHTML = originalText;
    }
}

async function generateWord(items, title, filenamePrefix) {
    let htmlBody = `
        <h1 style="font-size: 24pt; font-family: Arial, sans-serif; color: #333;">${title}</h1>
        <p style="font-size: 10pt; font-family: Arial, sans-serif; color: #666;">Generated on: ${new Date().toLocaleDateString()}</p>
        <br/>
        <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif;">
    `;

    // Calculate Total Episodes
    const totalEpisodes = items.reduce((acc, item) => acc + (parseInt(item.episodes) || 0), 0);

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        let imgHtml = '<div style="width: 100px; height: 150px; background: #eee; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; font-size: 10px;">No Image</div>';
        
        if (item.picture) {
            try {
                const base64Img = await getDataUrl(item.picture);
                if (base64Img) {
                    imgHtml = `<img src="${base64Img}" width="100" height="150" style="object-fit: cover; border: 1px solid #ddd;" />`;
                }
            } catch (err) {
                console.warn("Failed to load image for Word", item.title);
            }
        }
        
        // Tags
        const tags = (item.tags || []).slice(0, 5).join(", ");

        htmlBody += `
            <tr style="border-bottom: 1px solid #ccc;">
                <td style="width: 120px; padding: 10px; vertical-align: top;">
                    ${imgHtml}
                </td>
                <td style="padding: 10px; vertical-align: top;">
                    <h2 style="font-size: 14pt; margin: 0 0 5px 0; color: #000;">${i + 1}. ${item.title}</h2>
                    <div style="font-size: 10pt; color: #444; margin-bottom: 4px;">
                        <strong>Year:</strong> ${item.year || '-'} &nbsp;|&nbsp; 
                        <strong>Type:</strong> ${item.type || 'TV'} &nbsp;|&nbsp; 
                        <strong>Episodes:</strong> ${item.episodes || '-'}
                    </div>
                    <div style="font-size: 10pt; color: #444; margin-bottom: 4px;">
                        <strong>Status:</strong> ${item.status || 'Unknown'}
                    </div>
                    ${tags ? `<div style="font-size: 9pt; color: #666; margin-top: 5px;"><em>Genres: ${tags}</em></div>` : ''}
                </td>
            </tr>
        `;
    }

    htmlBody += `
        </table>
        <br/>
        <div style="text-align: right; font-family: Arial, sans-serif; font-size: 12pt; border-top: 2px solid #333; padding-top: 10px;">
            <strong>Total Anime:</strong> ${items.length}<br/>
            <strong>Total Episodes:</strong> ${totalEpisodes}
        </div>
    `;

    const docContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset='utf-8'>
            <title>${title}</title>
             <!--[if gte mso 9]>
            <xml>
            <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
            </xml>
            <![endif]-->
        </head>
        <body>
            ${htmlBody}
        </body>
        </html>
    `;

    const blob = new Blob([docContent], { type: 'application/msword' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filenamePrefix}_${new Date().toISOString().slice(0,10)}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function exportPdf() {
    const target = dom.exportTarget.value; // 'watched' | 'favorites'
    
    if (!window.jspdf) { alert("PDF Library not loaded."); return; }

    let items = [];
    let title = "";
    let filename = "";

    if (target === 'favorites') {
        items = state.allAnime.filter(a => state.favoriteIds.has(a.id));
        title = "My Favorite Anime List";
        filename = "anime_favorite_list";
        if (items.length === 0) { alert("No favorite anime to export!"); return; }
    } else {
        items = state.allAnime.filter(a => state.watchedIds.has(a.id));
        title = "My Watched Anime List";
        filename = "anime_watched_list";
        if (items.length === 0) { alert("No watched anime to export!"); return; }
    }
    
    const originalText = dom.exportPdfBtn.innerHTML;
    dom.exportPdfBtn.disabled = true;
    dom.exportPdfBtn.innerHTML = `<span class="animate-pulse">Generating...</span>`;
    
    try {
        await generatePdf(items, title, filename);
    } catch (e) {
        console.error(e);
        alert("Failed to generate PDF");
    } finally {
        dom.exportPdfBtn.disabled = false;
        dom.exportPdfBtn.innerHTML = originalText;
    }
}

async function generatePdf(items, title, filenamePrefix) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22); 
    doc.text(title, 20, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);
    doc.setTextColor(0);

    let y = 45; 
    const pageHeight = doc.internal.pageSize.height;
    const margin = 20;
    const imgWidth = 15;
    const imgHeight = 22; // approx 2:3 ratio
    const rowHeight = 28; // height per item block
    
    doc.setFontSize(10);
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // Check Page Break
        if (y + rowHeight > pageHeight - margin) {
            doc.addPage();
            y = 20;
        }

        // --- Image ---
        if (item.picture) {
            try {
                // Attempt to get base64 data
                const base64Img = await getDataUrl(item.picture);
                if (base64Img) {
                    doc.addImage(base64Img, 'JPEG', margin, y, imgWidth, imgHeight);
                } else {
                    // Fallback placeholder Box
                    doc.setDrawColor(200);
                    doc.rect(margin, y, imgWidth, imgHeight);
                    doc.setFontSize(6);
                    doc.text("No Img", margin + 2, y + 10);
                    doc.setFontSize(10);
                }
            } catch (err) {
                console.warn("Failed to load image for PDF", item.title);
            }
        }

        // --- Text Details ---
        const textX = margin + imgWidth + 5;
        const eps = item.episodes ? `${item.episodes} ep` : '-';
        const year = item.year || '-';
        const titleFull = `${i + 1}. ${item.title}`;
        
        // Truncate title if too long
        const safeTitle = titleFull.length > 55 ? titleFull.substring(0, 52) + '...' : titleFull;

        // Title
        doc.setFont(undefined, 'bold');
        doc.text(safeTitle, textX, y + 5);
        doc.setFont(undefined, 'normal');

        // Metadata
        doc.setFontSize(9);
        doc.setTextColor(80);
        doc.text(`${year} • ${item.type || 'TV'} • ${eps}`, textX, y + 10);
        
        // Tags (First 3)
        const safeTags = (item.tags || []).slice(0, 3).join(", ");
        if (safeTags) {
             doc.text(`Genres: ${safeTags}`, textX, y + 15);
        }
        
        // Status
        if (item.status) {
            doc.text(`Status: ${item.status}`, textX, y + 20);
        }
        
        doc.setTextColor(0);
        doc.setFontSize(10);

        y += rowHeight;
        
        // Optional Divider
        doc.setDrawColor(230);
        doc.line(margin, y - 4, 190, y - 4);
    }

    // Footer Total
    if (y > pageHeight - 40) { doc.addPage(); y = 30; }
    y += 5;
    
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(20, y, 190, y);
    y += 10;
    
    // Calculate Total Episodes
    const totalEpisodes = items.reduce((acc, item) => acc + (parseInt(item.episodes) || 0), 0);

    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Total Anime: ${items.length}`, 190, y, { align: 'right' });
    y += 6;
    doc.text(`Total Episodes: ${totalEpisodes}`, 190, y, { align: 'right' });

    doc.save(`${filenamePrefix}_${new Date().toISOString().slice(0,10)}.pdf`);
}

async function getDataUrl(url) {
    if (!url) return null;
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous"; 
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            try {
                resolve(canvas.toDataURL('image/jpeg'));
            } catch (e) {
                // Return null if canvas is tainted (CORS)
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
    });
}

// --- Utils ---
function debounce(func, wait) {
    let timeout;
    return function (...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); };
}
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function loadSettings() {
    const stored = localStorage.getItem('anime-checklist-v1');
    if (stored) {
        const data = JSON.parse(stored);
        if (Array.isArray(data.watched)) state.watchedIds = new Set(data.watched);
        if (Array.isArray(data.favorites)) state.favoriteIds = new Set(data.favorites);
        if (data.theme) state.theme = data.theme;
        if (data.viewMode) state.viewMode = data.viewMode;
    }
}
function saveSettings() {
    localStorage.setItem('anime-checklist-v1', JSON.stringify({
        watched: Array.from(state.watchedIds),
        favorites: Array.from(state.favoriteIds),
        theme: state.theme,
        viewMode: state.viewMode
    }));
}
function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'green' : 'dark';
    applyTheme();
    saveSettings();
}
function applyTheme() {
    const { html, body, header, search, filterBar } = dom;
    const selects = filterBar.querySelectorAll('select');
    
    if (state.theme === 'green') {
        html.classList.replace('dark', 'green');
        if (!html.classList.contains('green')) html.classList.add('green');
        
        // Evergreen Theme
        body.classList.replace('bg-dark-bg', 'bg-[#042018]'); body.classList.replace('text-dark-text', 'text-[#E0F2F1]');
        header.classList.replace('bg-dark-bg/90', 'bg-[#042018]/90'); header.classList.replace('border-dark-border', 'border-[#1E5740]');
        filterBar.classList.replace('bg-dark-bg/95', 'bg-[#042018]/95'); filterBar.classList.replace('border-dark-border', 'border-[#1E5740]');
        search.classList.replace('bg-dark-hover', 'bg-[#124734]'); search.classList.replace('border-dark-border', 'border-[#1E5740]');
        search.classList.replace('placeholder-gray-600', 'placeholder-[#6EE7B7]');
        
        selects.forEach(s => {
            s.classList.replace('bg-dark-hover', 'bg-[#124734]');
            s.classList.replace('border-dark-border', 'border-[#1E5740]');
            s.style.color = '#E0F2F1';
        });

        document.getElementById('icon-sun').classList.remove('hidden'); document.getElementById('icon-moon').classList.add('hidden');
    } else {
        html.classList.replace('green', 'dark');
        // Revert to 'dark-*' utility classes which now map to the Moon Palette
        body.classList.replace('bg-[#042018]', 'bg-dark-bg'); body.classList.replace('text-[#E0F2F1]', 'text-dark-text');
        header.classList.replace('bg-[#042018]/90', 'bg-dark-bg/90'); header.classList.replace('border-[#1E5740]', 'border-dark-border');
        filterBar.classList.replace('bg-[#042018]/95', 'bg-dark-bg/95'); filterBar.classList.replace('border-[#1E5740]', 'border-dark-border');
        search.classList.replace('bg-[#124734]', 'bg-dark-hover'); search.classList.replace('border-[#1E5740]', 'border-dark-border');
        search.classList.replace('placeholder-[#6EE7B7]', 'placeholder-gray-600');

        selects.forEach(s => {
            s.classList.replace('bg-[#124734]', 'bg-dark-hover');
            s.classList.replace('border-[#1E5740]', 'border-dark-border');
            s.style.color = '#EDEDED'; // Reset to standard light text for dark mode
        });

        document.getElementById('icon-sun').classList.add('hidden'); document.getElementById('icon-moon').classList.remove('hidden');
    }
    renderVirtualList();
}

init();
