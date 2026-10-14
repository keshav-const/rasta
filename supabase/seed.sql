-- Seed data: Delhi + Gurgaon (NCR) destinations and core areas.
-- Gives the pipeline FK targets (destination_id / area_id) on day one.
-- Idempotent: safe to re-run (on conflict do nothing on unique slugs).

-- ---------------------------------------------------------------------------
-- Destinations
-- ---------------------------------------------------------------------------
insert into destinations (name, name_local, slug, type, lat, lng, description) values
    ('Delhi',   'दिल्ली',  'delhi',   'city', 28.6139, 77.2090, 'National capital; Old Delhi food + monuments, South Delhi cafes.'),
    ('Gurgaon', 'गुड़गांव', 'gurgaon', 'city', 28.4595, 77.0266, 'NCR satellite city; nightlife, malls, corporate dining hubs.')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Areas — Delhi
-- ---------------------------------------------------------------------------
insert into areas (destination_id, name, name_local, slug, lat, lng)
select d.id, a.name, a.name_local, a.slug, a.lat, a.lng
from destinations d
join (values
    ('Chandni Chowk',     'चांदनी चौक',   'chandni-chowk',     28.6506, 77.2303),
    ('Jama Masjid',       'जामा मस्जिद',  'jama-masjid',       28.6507, 77.2334),
    ('Connaught Place',   'कनॉट प्लेस',   'connaught-place',   28.6315, 77.2167),
    ('Hauz Khas Village', 'हौज़ खास',     'hauz-khas-village', 28.5535, 77.1942),
    ('Khan Market',       'खान मार्केट',  'khan-market',       28.6000, 77.2272),
    ('Karol Bagh',        'करोल बाग',     'karol-bagh',        28.6519, 77.1909),
    ('Paharganj',         'पहाड़गंज',     'paharganj',         28.6448, 77.2120),
    ('Lajpat Nagar',      'लाजपत नगर',    'lajpat-nagar',      28.5677, 77.2433),
    ('Nizamuddin',        'निज़ामुद्दीन', 'nizamuddin',        28.5933, 77.2507),
    ('Saket',             'साकेत',        'saket',             28.5245, 77.2066),
    ('Majnu ka Tila',     'मजनू का टीला', 'majnu-ka-tila',     28.7050, 77.2285)
) as a(name, name_local, slug, lat, lng) on true
where d.slug = 'delhi'
on conflict (destination_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Areas — Gurgaon
-- ---------------------------------------------------------------------------
insert into areas (destination_id, name, name_local, slug, lat, lng)
select d.id, a.name, a.name_local, a.slug, a.lat, a.lng
from destinations d
join (values
    ('DLF Cyber Hub',    'साइबर हब',     'cyber-hub',        28.4949, 77.0886),
    ('Sector 29',        'सेक्टर 29',    'sector-29',        28.4675, 77.0628),
    ('Golf Course Road', 'गोल्फ कोर्स रोड','golf-course-road', 28.4500, 77.0990),
    ('MG Road',          'एमजी रोड',     'mg-road',          28.4796, 77.0803),
    ('Sohna Road',       'सोहना रोड',    'sohna-road',       28.4089, 77.0380)
) as a(name, name_local, slug, lat, lng) on true
where d.slug = 'gurgaon'
on conflict (destination_id, slug) do nothing;
