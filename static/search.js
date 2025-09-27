const IPINFO_TOKEN = window.CONFIG?.IPINFO_TOKEN || '';
const GOOGLE_GEOCODING_API_KEY = window.CONFIG?.GOOGLE_GEOCODING_API_KEY || '';


let currentSort = { column: null, direction: 'asc' };
let eventsData = [];

document.addEventListener('DOMContentLoaded', function () {
   const form = document.getElementById('eventsForm');
   const autoDetectCheckbox = document.getElementById('autoDetect');
   const locationInput = document.getElementById('location');
   const clearBtn = document.getElementById('clearBtn');
   const closeEventDetails = document.getElementById('closeEventDetails');
   const closeVenueDetails = document.getElementById('closeVenueDetails');

   autoDetectCheckbox.addEventListener('change', handleAutoDetectChange);
   form.addEventListener('submit', handleFormSubmit);
   clearBtn.addEventListener('click', clearForm);
   closeEventDetails.addEventListener('click', closeEventDetailsCard);
   if (closeVenueDetails) {
     closeVenueDetails.addEventListener('click', closeVenueDetailsCard);
   }

  document.addEventListener('click', function (e) {
    const resultRow = e.target.closest('#resultsBody tr[data-event-id]');
    if (resultRow) {
      e.preventDefault();
      showEventDetails(resultRow.dataset.eventId);
      return;
    }
    const eventCell = e.target.closest('.event-cell');
    if (eventCell) {
      e.preventDefault();
      showEventDetails(eventCell.dataset.eventId);
      return;
    }
    const eventBtn = e.target.closest('.event-link');
    if (eventBtn) {
      e.preventDefault();
      showEventDetails(eventBtn.dataset.eventId);
      return;
    }
    const venueBtn = e.target.closest('.venue-toggle');
    if (venueBtn) {
      e.preventDefault();
      showVenueDetails(venueBtn.dataset.venueName);
      return;
    }
    const sortBtn = e.target.closest('.sort-btn');
    if (sortBtn) {
      e.preventDefault();
      sortTable(sortBtn.dataset.column, sortBtn);
      return;
    }
  });

  function handleAutoDetectChange() {
    if (autoDetectCheckbox.checked) {
      locationInput.style.display = 'none';
      document.getElementById('locationLabel').classList.remove('required');
      locationInput.removeAttribute('required');
      detectLocation();
    } else {
      locationInput.style.display = 'block';
      document.getElementById('locationLabel').classList.add('required');
      locationInput.setAttribute('required', 'required');
      locationInput.value = '';
      delete locationInput.dataset.coords;
    }
  }

  async function detectLocation() {
    try {
      const response = await fetch(`https://ipinfo.io?token=${IPINFO_TOKEN}`);
      const data = await response.json();
      if (data.loc) {
        const [lat, lon] = data.loc.split(',');
        locationInput.dataset.coords = `${lat},${lon}`;
      } else {
        throw new Error('Unable to detect location');
      }
    } catch (error) {
      console.error('Error detecting location:', error);
      autoDetectCheckbox.checked = false;
      handleAutoDetectChange();
      showTooltip('location-tooltip', 'Unable to auto-detect location. Please enter manually.');
    }
  }

  async function geocodeAddress(address) {
    try {
      if (!GOOGLE_GEOCODING_API_KEY) {
        throw new Error('Google Geocoding API key not configured');
      }
      
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_GEOCODING_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK' && data.results.length > 0) {
        const loc = data.results[0].geometry.location;
        return { lat: loc.lat, lng: loc.lng };
      } else if (data.status === 'REQUEST_DENIED') {
        throw new Error('API key invalid or geocoding service disabled');
      } else if (data.status === 'ZERO_RESULTS') {
        throw new Error('No results found for this address');
      } else {
        throw new Error(`Geocoding failed: ${data.status}`);
      }
    } catch (error) {
      console.error('Error geocoding address:', error);
      throw error;
    }
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    hideAllTooltips();

    const formData = new FormData(form);
    const keyword = (formData.get('keyword') || '').trim();
    const distance = (formData.get('distance') || '10').trim() || '10';
    const category = (formData.get('category') || '').trim();

    if (!keyword) {
      showTooltip('keyword-tooltip', 'This field is required');
      return;
    }

    let lat, lon;
    if (autoDetectCheckbox.checked) {
      const coords = locationInput.dataset.coords;
      if (!coords) {
        showTooltip('location-tooltip', 'Location detection failed. Please try again.');
        return;
      }
      [lat, lon] = coords.split(',');
    } else {
      const locationText = (formData.get('location') || '').trim();
      if (!locationText) {
        showTooltip('location-tooltip', 'This field is required');
        return;
      }
      try {
        const coords = await geocodeAddress(locationText);
        lat = coords.lat;
        lon = coords.lng;
      } catch (error) {
        if (error.message.includes('API key')) {
          showTooltip('location-tooltip', 'Location service not configured. Please contact administrator.');
        } else if (error.message.includes('No results found')) {
          showTooltip('location-tooltip', 'Location not found. Please try a different address.');
        } else {
          showTooltip('location-tooltip', 'Unable to find location. Please check the address.');
        }
        return;
      }
    }

    const searchParams = new URLSearchParams({
      keyword,
      distance,
      category,
      lat: lat,
      lon: lon
    });

     try {
       const response = await fetch(`http://127.0.0.1:3001/api/search?${searchParams}`);
       const data = await response.json();

      if (response.ok) {
        displaySearchResults(data);
      } else {
        console.error('Search failed:', data.error);
        displayNoResults();
      }
    } catch (error) {
      console.error('Search error:', error);
      displayNoResults();
    }
  }

  function displaySearchResults(data) {
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsTable = document.getElementById('resultsTable');
    const resultsBody = document.getElementById('resultsBody');
    const noResults = document.getElementById('noResults');

    if (!data._embedded || !data._embedded.events || data._embedded.events.length === 0) {
      displayNoResults();
      return;
    }

    eventsData = data._embedded.events;
    let tableHTML = '';

    eventsData.forEach(event => {
      const date = event.dates?.start?.localDate || '';
      const time = event.dates?.start?.localTime || '';
      const dateTime = time ? `${date}<br>${time}` : date;

      const eventName = event.name || 'N/A';
      const venue = event._embedded?.venues?.[0]?.name || 'N/A';

      let genre = 'N/A';
      if (event.classifications?.[0]?.segment?.name) {
        genre = event.classifications[0].segment.name;
      }

      tableHTML += `
        <tr data-event-id="${event.id}">
          <td style="text-align:center;">${dateTime}</td>
          <td style="text-align:center;">
            ${event.images && event.images.length > 0
              ? `<img src="${event.images[0].url}" alt="Event" style="width:100px;height:auto;object-fit:cover;">`
              : 'N/A'}
          </td>
          <td class="event-cell" data-event-id="${event.id}"><span class="event-name">${eventName}</span></td>
          <td style="text-align:center;">${genre}</td>
          <td style="text-align:center;">${venue}</td>
        </tr>
      `;
    });

    resultsBody.innerHTML = tableHTML;
    resultsTable.style.display = 'table';
    noResults.style.display = 'none';
    resultsContainer.style.display = 'block';
    resultsContainer.scrollIntoView({ behavior: 'smooth' });

    updateSortHeaders(null, null);
  }

  function displayNoResults() {
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsTable = document.getElementById('resultsTable');
    const resultsBody = document.getElementById('resultsBody');
    const noResults = document.getElementById('noResults');

    resultsBody.innerHTML = '';
    resultsTable.style.display = 'none';
    noResults.style.display = 'block';
    resultsContainer.style.display = 'block';
    resultsContainer.scrollIntoView({ behavior: 'smooth' });
  }

  function showTooltip(tooltipId, message) {
    const tooltip = document.getElementById(tooltipId);
    tooltip.textContent = message;
    tooltip.style.display = 'block';
    setTimeout(() => { tooltip.style.display = 'none'; }, 3000);
  }

  function hideAllTooltips() {
    document.querySelectorAll('.tooltip').forEach(t => { t.style.display = 'none'; });
  }

  function clearForm() {
    form.reset();
    document.getElementById('distance').placeholder = '10';
    document.getElementById('category').value = '';
    autoDetectCheckbox.checked = false;
    handleAutoDetectChange();
    hideAllTooltips();

    document.getElementById('resultsContainer').style.display = 'none';
    document.getElementById('eventDetails').style.display = 'none';
    document.getElementById('venueDetails').style.display = 'none';
  }

   function closeEventDetailsCard() {
     document.getElementById('eventDetails').style.display = 'none';
     document.getElementById('venueDetails').style.display = 'none';
   }

 function closeVenueDetailsCard() {
   document.getElementById('venueDetails').style.display = 'none';
 }

  window.clearForm = clearForm;
  window.sortTable = sortTable;
  window.showEventDetails = showEventDetails;
  window.showVenueDetails = showVenueDetails;

  function updateSortHeaders(column, direction) {
    const ths = document.querySelectorAll('#resultsTable thead th.sortable');
    ths.forEach(th => th.classList.remove('sort-asc', 'sort-desc'));
    if (!column) return;
    const btn = document.querySelector(`.sort-btn[data-column="${column}"]`);
    if (btn) {
      const th = btn.closest('th');
      th.classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  }

  function sortTable(column, btnEl) {
    const tbody = document.querySelector('.results-table tbody');
    if (!tbody) return;

    const rows = Array.from(tbody.rows);

    if (currentSort.column === column) {
      currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      currentSort.column = column;
      currentSort.direction = 'asc';
    }

    rows.sort((a, b) => {
      let aVal, bVal;
      switch (column) {
        case 'event': aVal = a.cells[2].textContent.trim(); bVal = b.cells[2].textContent.trim(); break;
        case 'genre': aVal = a.cells[3].textContent.trim(); bVal = b.cells[3].textContent.trim(); break;
        case 'venue': aVal = a.cells[4].textContent.trim(); bVal = b.cells[4].textContent.trim(); break;
        default: return 0;
      }
      if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
      return 0;
    });

    rows.forEach(row => tbody.appendChild(row));
    updateSortHeaders(currentSort.column, currentSort.direction);
  }
});

async function showEventDetails(eventId) {
  if (!eventId) { console.error('Invalid eventId'); return; }
   try {
     const response = await fetch(`http://127.0.0.1:3001/api/event?id=${encodeURIComponent(eventId)}`);
     const data = await response.json();
    if (response.ok && data) {
      displayEventDetails(data);
      // If venue details are open, refresh them for the new event's venue
      try {
        const openVenuePanel = document.getElementById('venueDetails');
        const isOpen = openVenuePanel && openVenuePanel.style.display === 'block';
        const venueName = data?._embedded?.venues?.[0]?.name;
        if (isOpen && venueName) {
          await showVenueDetails(venueName);
        }
      } catch (err) {
        console.warn('Unable to auto-refresh venue details:', err);
      }
    } else {
      console.error('Failed to fetch event details:', data.error);
    }
  } catch (error) {
    console.error('Error fetching event details:', error);
  }
}

function displayEventDetails(eventData) {
  const eventDetails = document.getElementById('eventDetails');
  const eventDetailsBody = document.getElementById('eventDetailsBody');
  const venueToggleContainer = document.getElementById('venueToggleContainer');
  const eventDetailsHeader = document.querySelector('#eventDetails .event-details-header h3');

  if (eventDetailsHeader) {
    eventDetailsHeader.textContent = eventData.name || 'Event Details';
  }

  let detailsHTML = '';
  let seatmapHTML = '';

  if (eventData.dates?.start) {
    const date = eventData.dates.start.localDate || '';
    const time = eventData.dates.start.localTime || '';
    const dateTime = time ? `${date} ${time}` : date;
    if (dateTime) {
      detailsHTML += `
        <div class="event-detail-row">
          <div class="event-detail-label">Date:</div>
          <div class="event-detail-value">${dateTime}</div>
        </div>`;
    }
  }

  if (eventData._embedded?.attractions) {
    const artists = eventData._embedded.attractions.map(attraction =>
      (attraction.url
        ? `<a href="${attraction.url}" target="_blank" rel="noopener" class="artist-link">${attraction.name}</a>`
        : `<span class="artist-link" style="cursor: default; text-decoration: none;">${attraction.name}</span>`)
    ).join(' | ');
    detailsHTML += `
      <div class="event-detail-row">
        <div class="event-detail-label">Artist/Team:</div>
        <div class="event-detail-value">${artists}</div>
      </div>`;
  }

  if (eventData._embedded?.venues?.[0]?.name) {
    const venueName = eventData._embedded.venues[0].name;
    detailsHTML += `
      <div class="event-detail-row">
        <div class="event-detail-label">Venue:</div>
        <div class="event-detail-value">${venueName}</div>
      </div>`;
  }

  if (eventData.classifications?.[0]) {
    const c = eventData.classifications[0];
    const parts = [c.subGenre?.name, c.genre?.name, c.segment?.name, c.subType?.name, c.type?.name]
      .filter(p => p && p !== 'Undefined');
    if (parts.length > 0) {
      detailsHTML += `
        <div class="event-detail-row">
          <div class="event-detail-label">Genre:</div>
          <div class="event-detail-value">${parts.join(' | ')}</div>
        </div>`;
    }
  }

  if (eventData.priceRanges?.[0]) {
    const pr = eventData.priceRanges[0];
    const currency = pr.currency || 'USD';
    const minPrice = pr.min ?? 'N/A';
    const maxPrice = pr.max ?? 'N/A';
    const priceText = `${minPrice} - ${maxPrice} ${currency}`;
    detailsHTML += `
      <div class="event-detail-row">
        <div class="event-detail-label">Price Ranges:</div>
        <div class="event-detail-value">${priceText}</div>
      </div>`;
  }

  if (eventData.dates?.status?.code) {
    const status = eventData.dates.status.code.toLowerCase();
    let statusClass = '';
    if (status.includes('onsale')) statusClass = 'status-onsale';
    else if (status.includes('offsale')) statusClass = 'status-offsale';
    else if (status.includes('cancel')) statusClass = 'status-cancelled';
    else if (status.includes('postponed') || status.includes('rescheduled')) statusClass = 'status-postponed';

    detailsHTML += `
      <div class="event-detail-row">
        <div class="event-detail-label">Ticket Status:</div>
        <div class="event-detail-value ${statusClass}">${eventData.dates.status.code}</div>
      </div>`;
  }

  if (eventData.url) {
    detailsHTML += `
      <div class="event-detail-row">
        <div class="event-detail-label">Buy Ticket At:</div>
        <div class="event-detail-value"><a href="${eventData.url}" target="_blank" rel="noopener">Ticketmaster</a></div>
      </div>`;
  }

   if (eventData.seatmap?.staticUrl) {
     seatmapHTML = `
       <div class="seatmap-image">
         <img src="${eventData.seatmap.staticUrl}" alt="Seat Map" style="max-width:100%;height:auto;">
       </div>`;
   }

  const layoutHTML = `
    <div class="event-details-layout">
      <div class="event-details-column">
        ${detailsHTML}
      </div>
      ${seatmapHTML ? `<div class="seatmap-column">${seatmapHTML}</div>` : ''}
    </div>`;

  eventDetailsBody.innerHTML = layoutHTML;
  eventDetails.style.display = 'block';
  eventDetails.scrollIntoView({ behavior: 'smooth' });

  // Render Show Venue Details button OUTSIDE the event modal
  if (eventData._embedded?.venues?.[0]?.name) {
    venueToggleContainer.innerHTML = `<button type="button" class="venue-toggle" data-venue-name="${eventData._embedded.venues[0].name}">Show Venue Details ▼</button>`;
    venueToggleContainer.style.display = 'block';
  } else {
    venueToggleContainer.style.display = 'none';
    venueToggleContainer.innerHTML = '';
  }
}

async function showVenueDetails(venueName) {
  if (!venueName) { console.error('Invalid venueName'); return; }
   try {
     const response = await fetch(`http://127.0.0.1:3001/api/venue?keyword=${encodeURIComponent(venueName)}`);
     const data = await response.json();
    if (response.ok && data._embedded?.venues?.length > 0) {
      displayVenueDetails(data._embedded.venues[0]);
      const venueToggle = document.querySelector('.venue-toggle');
      if (venueToggle) venueToggle.style.display = 'none';
    } else {
      console.error('Failed to fetch venue details:', data.error);
    }
  } catch (error) {
    console.error('Error fetching venue details:', error);
  }
}

function displayVenueDetails(venue) {
  const venueDetails = document.getElementById('venueDetails');
  const venueDetailsBody = document.getElementById('venueDetailsBody');

  const name = venue?.name || 'N/A';
  const addressLine1 = venue?.address?.line1 || 'N/A';
  const cityState = [venue?.city?.name || '', venue?.state?.stateCode || ''].filter(Boolean).join(', ') || 'N/A';
  const postalCode = venue?.postalCode || 'N/A';
  const moreEventsUrl = venue?.url || null;
  const venueImageUrl = venue?.images?.[0]?.url || null;

  const fullAddress = [venue?.name, venue?.address?.line1, venue?.city?.name, venue?.state?.stateCode, venue?.postalCode]
    .filter(Boolean).join(', ');
  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  let detailsHTML = `
    <div class="venue-card">
      <div class="venue-card-content">
        <div class="venue-card-header">${name !== 'N/A' ? name : 'Venue Details'}</div>
        <div class="venue-logo-box"> 
          ${venueImageUrl ? `<img class="venue-logo" src="${venueImageUrl}" alt="${name}">` : ''}
        </div>
        <div class="venue-card-row">
          <div class="venue-card-left">
            <div class="venue-address">
              <div class="venue-address-label">Address:
              ${addressLine1 !== 'N/A' ? addressLine1 : 'N/A'}
                ${(cityState !== 'N/A' || postalCode !== 'N/A') ? `<br>${[cityState !== 'N/A' ? cityState : '', postalCode !== 'N/A' ? postalCode : ''].filter(Boolean).join(' ')}` : ''}
              </div>
            </div>
            <div class="venue-maps-link">
              ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noopener">Open in Google Maps</a>` : 'N/A'}
            </div>
          </div>
          <div class="venue-card-divider-vertical"></div>
          <div class="venue-card-right">
            ${moreEventsUrl ? `<a href="${moreEventsUrl}" target="_blank" rel="noopener">More events at this venue</a>` : 'N/A'}
          </div>
        </div>
      </div>
    </div>
  `;

  venueDetailsBody.innerHTML = detailsHTML;
  venueDetails.style.display = 'block';
  venueDetails.scrollIntoView({ behavior: 'smooth' });
}
