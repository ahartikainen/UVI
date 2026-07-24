https://ahartikainen.github.io/UVI/

# UV-ennuste

Kevyt, staattinen UV-indeksiennuste GitHub Pagesia varten.

## Ominaisuudet

- Aurinkosuojan suositus UVI-rajan 3 perusteella sekä erilliset, lineaarisesti interpoloidut alkamis- ja päättymisajat arvoille `uv_index` ja `uv_index_clear_sky`

- Helsingin keskusta oletussijaintina
- sijainnin valinta kartalta
- puhelimen GPS-paikannus
- osoite- ja paikkahaku
- Open-Meteon tuntikohtainen UV-indeksi ja selkeän taivaan vertailu
- 24 tunnin, 72 tunnin ja 7 vuorokauden kuvaajat
- tarkka arvo kuvaajaa klikkaamalla tai napauttamalla
- mobiiliystävällinen käyttöliittymä
- hakukoneindeksoinnin esto `noindex,nofollow`-metatiedolla

## Julkaisu GitHub Pagesissa

1. Luo GitHubiin uusi repository.
2. Lisää tämän hakemiston tiedostot repositoryn juureen.
3. Avaa repositoryssa **Settings → Pages**.
4. Valitse **Deploy from a branch**.
5. Valitse branch `main` ja kansio `/root`.
6. Tallenna asetukset.

Sivusto julkaistaan yleensä osoitteeseen:

`https://KAYTTAJANIMI.github.io/REPOSITORYN-NIMI/`

## Paikallinen testaus

GPS ei yleensä toimi suoraan `file://`-osoitteesta. Käynnistä paikallinen palvelin:

```bash
python3 -m http.server 8000
```

Avaa sitten:

`http://localhost:8000`

## Rajapinnat ja attribuutiot

- Ennuste: Open-Meteo
- Kartta, karttatiilet ja osoitehaku: OpenStreetMap / Nominatim

Osoitehaku tehdään vain käyttäjän painaessa Hae-painiketta. Sovellus rajoittaa peräkkäisiä hakuja ja välimuistittaa tulokset selainistunnon ajaksi.


## Päivitetyt ominaisuudet

- Selkeä nykyhetken UVI-arvio ja tieto siitä, onko UV-suojautumisen suositus voimassa juuri nyt.
- Päivän suositusjakson alkamis- ja päättymisajat samassa näkymässä.
- Käytetty sijainti näkyy nimellä, koordinaatteina ja Suomen yleiskartalla.
- **Tänään**-valinta näyttää koko vuorokauden tuntidatan klo 00–23, myös jo kuluneet tunnit.

Open-Meteon ennustevastaus alkaa oletuksena kuluvan päivän klo 00:sta, joten menneet tunnit voidaan näyttää saman päivän kuvaajassa. Nykyhetken arvo on lähimmän tuntipisteen arvio.


## UV-arvojen tulkinta

Sivu näyttää kaksi Open-Meteon arvoa erillään eikä laske niiden keskiarvoa:

- **Sääennuste huomioitu** (`uv_index`) sisältää ennustetun pilvisyyden vaikutuksen.
- **Pilvetön taivas** (`uv_index_clear_sky`) on vertailuarvo tilanteelle, jossa pilvet eivät vaimenna UV-säteilyä.

Molemmille sarjoille lasketaan UVI 3:n ylitys- ja alitusajat lineaarisella interpoloinnilla minuutin tarkkuudella.

Kuvaaja ja taulukko käyttävät samaa `visibleRows()`-aineistoa valitulla aikavälillä. Tänään-valinta näyttää kaikki kuluvan päivän tunnit; muut valinnat näyttävät vastaavan määrän tulevia tunteja.

## Mobiilikorjaukset

- Karttakuvien yleinen `max-width`-ristiriita on estetty MapLibre-kartassa.
- Kartat käyttävät pienempää korkeutta puhelimella ja niiden koko päivitetään selainikkunan muuttuessa.
- Taulukko muuttuu puhelimella korteiksi, jotta vaakavieritystä ei tarvita.
- Kuvaajan selite, akselit ja aikavälipainikkeet mukautuvat kapeaan näyttöön.


## Automaattinen ajan seuranta

Sivu päivittää nykyhetken viivan, valitun aloitustunnin arvot, suojaussuosituksen ja nykyisen taulukkorivin minuutin välein. Ennustedata haetaan uudelleen tunnin vaihtuessa. Kuvaajan vaaleat tausta-alueet näyttävät UVI 3 -suojausjaksot sääennuste huomioiden ja pilvettömän taivaan vertailulle.

## Version 4

- Yhteenveto seuraa nykyisen alkaneen tunnin Open-Meteo-arvoa.
- Nykyhetken viiva ja yhteenveto päivittyvät minuutin välein.
- Kuvaaja näyttää UVI 3 -suojausjaksot hillittyinä tausta-alueina jokaiselle näkyvälle päivälle.
- Suosituksessa näytetään seuraava muutos ja arvioitu aika siihen.
- Yhteenvedossa näytetään pilvien arvioitu vaikutus prosentteina ja UVI-yksikköinä.

## Versio 5

- Aikavyöhykkeen oletus määräytyy valittujen koordinaattien perusteella (`timezone=auto`).
- Käyttäjä voi vaihtaa näytön laitteen aikavyöhykkeeseen, UTC-aikaan tai antaa muun IANA-aikavyöhykkeen, kuten `Europe/London`.
- Open-Meteon tuntiajat pyydetään Unix-aikaleimoina, ja kaikki yhteenveto-, suojaus-, taulukko- ja kuvaaja-ajat muotoillaan valitussa aikavyöhykkeessä.
- Kuvaajan x-akselille piirretään pystysuora ruudukkolinja jokaiselle tasatunnille.
- Kellonaikalabelit näytetään harvemmin: lyhyessä näkymässä 2–3 tunnin välein ja pidemmissä näkymissä väljemmin. Vuorokauden vaihtuessa näytetään päivämäärä.
- Molemmissa UV-sarjoissa näkyy datapiste jokaiselle tuntiarvolle; pitkissä näkymissä pisteet ovat pienempiä.


## Versio 6

- Otsikko muutettu kuvaavammaksi: **UV-indeksi ja aurinkosuojan ennuste**.
- Sivulle lisätty näkyvä huomautus siitä, ettei kyse ole virallisesta viranomais- tai terveydenhuollon työkalusta.
- Lisätty Open-Meteon UV-muuttujien, säämallipohjaisuuden ja ennusteluonteen kuvaus sekä linkit dokumentaatioon, datalähteisiin ja lisenssiin.
- Kuvaajan pilvettömän taivaan sarja käyttää nyt hillittyä okranruskeaa väriä, kun sääennuste huomioiva sarja säilyy turkoosina. Myös legendan viiva/piste ja suojausalueen selite vastaavat uusia värejä.
