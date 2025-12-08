// Afgangstavle - JavaScript

// HTML entities decoder
function decodeHtmlEntities(str) {
    return str.replace(/&#(\d+);/g, (m, code) => String.fromCharCode(code));
}

// Parser til Rejseplanen data
function extractJourneysObj(text) {
    console.log('Fetched text:', text.substring(0, 500) + '...');
    
    try {
        // Find the start of journeysObj
        const startIndex = text.indexOf('journeysObj = {');
        if (startIndex === -1) {
            console.error('Could not find journeysObj start in response');
            return null;
        }
        
        // Start from the opening brace
        const objectStart = text.indexOf('{', startIndex);
        let braceCount = 0;
        let endIndex = objectStart;
        
        // Find the matching closing brace
        for (let i = objectStart; i < text.length; i++) {
            if (text[i] === '{') {
                braceCount++;
            } else if (text[i] === '}') {
                braceCount--;
                if (braceCount === 0) {
                    endIndex = i;
                    break;
                }
            }
        }
        
        // Extract the complete object string
        const objectStr = text.substring(objectStart, endIndex + 1);
        console.log('Extracted object string length:', objectStr.length);
        console.log('Object preview:', objectStr.substring(0, 200) + '...');
        
        // Decode HTML entities first
        let cleaned = decodeHtmlEntities(objectStr);
        
        // Use eval to parse the JavaScript object
        const journeysObj = eval('(' + cleaned + ')');
        console.log('Successfully parsed journeysObj with', Object.keys(journeysObj).filter(k => k.startsWith('j')).length, 'journeys');
        return journeysObj;
        
    } catch (error) {
        console.error('Error parsing journeysObj:', error);
        return null;
    }
}

// Beregn tid til afgang
function calculateTimeUntil(departureTime) {
    if (!departureTime) return '';
    
    const now = new Date();
    const [hours, minutes] = departureTime.split(':').map(Number);
    
    const departure = new Date();
    departure.setHours(hours, minutes, 0, 0);
    
    // Hvis afgangstid er tidligere i dag end nu, antag det er i morgen
    if (departure < now) {
        departure.setDate(departure.getDate() + 1);
    }
    
    const diffMs = departure - now;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    // Hvis det er mere end 12 timer væk, vis bare klokketiden
    if (diffMinutes > 12 * 60) {
        return departureTime;
    }
    
    if (diffMinutes < 1) {
        return 'Nu';
    } else if (diffMinutes < 60) {
        return `${diffMinutes} min`;
    } else {
        const hours = Math.floor(diffMinutes / 60);
        const mins = diffMinutes % 60;
        return mins > 0 ? `${hours}t ${mins}min` : `${hours}t`;
    }
}

// Render tabel med afgange
function renderTable(journeysObj) {
    if (!journeysObj) return '<div>Ingen data</div>';
    let html = '<table style="width:100%;border-collapse:collapse;">';
    
    // Headers
    const headers = ['Om', 'Tog/bus', 'Retning'];
    html += '<tr>' + headers.map(h => `<th style="border-bottom:1px solid #ccc;text-align:left;padding:4px;">${h}</th>`).join('') + '</tr>';
    
    // Vis kun de næste 10 afgange
    const maxToShow = 10;
    let count = 0;
    
    for (let i = 1; i <= (journeysObj.maxJ || 50) && count < maxToShow; i++) {
        const j = journeysObj['j'+i];
        if (!j) continue;
        
        // Beregn tid til afgang (brug forsinket tid hvis tilgængelig)
        const actualTime = (j.rt && j.rt.dlt) ? j.rt.dlt : j.ti;
        const timeUntilDeparture = calculateTimeUntil(actualTime);
        
        html += '<tr>';
        html += `<td style="padding:4px;">${timeUntilDeparture}</td>`;
        html += `<td style="padding:4px;">${j.pr || ''}</td>`;
        html += `<td style="padding:4px;">${j.st || ''}</td>`;
        html += '</tr>';
        
        count++;
    }
    html += '</table>';
    return html;
}

// Få nuværende tid i HH:MM format
function getCurrentTime() {
    const now = new Date();
    return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
}

// Få URLs med nuværende tid
function getUrls() {
    const currentTime = getCurrentTime();
    return [
        `https://webapp.rejseplanen.dk/bin/stboard.exe/mn?L=vs_liveticker&amp;ml=m&amp;protocol=https:&amp;&input=3114!&boardType=dep&time=${currentTime}&selectDate=today&productsFilter=111111111111&additionalTime=0&start=yes&outputMode=tickerDataOnly&maxJourneys=10`,
        `https://webapp.rejseplanen.dk/bin/stboard.exe/mn?L=vs_liveticker&amp;ml=m&amp;protocol=https:&amp;&input=28387!&boardType=dep&time=${currentTime}&selectDate=today&productsFilter=111111111111&additionalTime=0&start=yes&outputMode=tickerDataOnly&maxJourneys=10`
    ];
}

// Hovedfunktion til opdatering af tavle
async function updateBoards() {
    console.log('Updating boards...');
    const urls = getUrls();
    console.log('Using current time:', getCurrentTime());
    let allJourneys = [];
    
    for (let i = 0; i < urls.length; i++) {
        try {
            console.log('Fetching from URL', i);
            const res = await fetch(urls[i]);
            if (!res.ok) {
                console.warn('HTTP error for URL', i, res.status);
                continue;
            }
            const text = await res.text();
            console.log('Got response from URL', i, 'length:', text.length);
            
            const journeysObj = extractJourneysObj(text);
            if (journeysObj) {
                console.log('Parsed journeys from URL', i, 'count:', journeysObj.maxJ);
                // Tilføj alle rejser fra dette stoppested
                for (let j = 1; j <= (journeysObj.maxJ || 50); j++) {
                    if (journeysObj['j' + j]) {
                        allJourneys.push(journeysObj['j' + j]);
                    }
                }
            } else {
                console.warn('No journeys parsed from URL', i);
            }
        } catch (e) {
            console.error('Error fetching URL', i, e);
        }
    }

    console.log('Total journeys found:', allJourneys.length);

    if (allJourneys.length === 0) {
        document.getElementById('table1').innerHTML = '<div>Ingen data fundet. Tjek konsollen for detaljer.</div>';
    } else {
        // Fjern duplikater baseret på tid, bus og destination
        const uniqueJourneys = [];
        const seen = new Set();
        
        for (const journey of allJourneys) {
            const key = `${journey.ti}-${journey.pr}-${journey.st}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueJourneys.push(journey);
            }
        }
        
        console.log('Unique journeys after deduplication:', uniqueJourneys.length);
        
        // Sorter efter tid
        uniqueJourneys.sort((a, b) => (a.ti || '').localeCompare(b.ti || ''));
        
        // Opret kombineret journeysObj
        const combinedObj = {
            headTexts: ['Om', 'Tog/bus', 'Retning'],
            maxJ: Math.min(uniqueJourneys.length, 10)
        };
        
        // Tilføj de første 10 rejser
        for (let i = 0; i < combinedObj.maxJ; i++) {
            combinedObj['j' + (i + 1)] = uniqueJourneys[i];
        }
        
        document.getElementById('table1').innerHTML = renderTable(combinedObj);
    }
    document.getElementById('updated').textContent = 'Sidst opdateret: ' + new Date().toLocaleTimeString('da-DK');
}

// Start applikationen
document.addEventListener('DOMContentLoaded', function() {
    setInterval(updateBoards, 60000); // Opdater hvert minut
    updateBoards(); // Første load
});