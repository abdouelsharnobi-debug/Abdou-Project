/*
 * City library seed for Region → Country → State → City selection.
 * Seed rows carry names, approximate coordinates and approximate elevation only
 * (status 'seed' — verify). Design temperatures are intentionally blank: ASHRAE climatic
 * design data is licensed and must be entered by the user from their own source.
 */
(function (root) {
  'use strict';
  const REGIONS = ['Africa', 'Asia', 'Europe', 'Mid-East', 'North & Central America', 'South America', 'South West Pacific'];

  // [region, country, state/province, city, lat, lon, elevation m (approx.)]
  const SEED = [
    ['Africa', 'Egypt', 'Cairo', 'Cairo', 30.04, 31.24, 75], ['Africa', 'Egypt', 'Alexandria', 'Alexandria', 31.2, 29.92, 5],
    ['Africa', 'Egypt', 'Giza', 'Giza', 30.01, 31.21, 20], ['Africa', 'Egypt', 'Port Said', 'Port Said', 31.26, 32.3, 3],
    ['Africa', 'Egypt', 'Suez', 'Suez', 29.97, 32.53, 5], ['Africa', 'Egypt', 'Aswan', 'Aswan', 24.09, 32.9, 110],
    ['Africa', 'Egypt', 'Luxor', 'Luxor', 25.69, 32.64, 90], ['Africa', 'Egypt', 'Red Sea', 'Hurghada', 27.26, 33.81, 15],
    ['Africa', 'Egypt', 'Sharqia', '10th of Ramadan City', 30.3, 31.75, 150], ['Africa', 'Egypt', 'Monufia', 'Sadat City', 30.37, 30.52, 60],
    ['Africa', 'Morocco', '—', 'Casablanca', 33.57, -7.59, 50], ['Africa', 'Morocco', '—', 'Tangier', 35.76, -5.83, 20],
    ['Africa', 'Algeria', '—', 'Algiers', 36.75, 3.06, 25], ['Africa', 'Tunisia', '—', 'Tunis', 36.81, 10.18, 10],
    ['Africa', 'Libya', '—', 'Tripoli', 32.89, 13.19, 20], ['Africa', 'Sudan', '—', 'Khartoum', 15.5, 32.56, 380],
    ['Africa', 'Ethiopia', '—', 'Addis Ababa', 9.03, 38.74, 2350], ['Africa', 'Kenya', '—', 'Nairobi', -1.29, 36.82, 1660],
    ['Africa', 'Kenya', '—', 'Mombasa', -4.04, 39.67, 20], ['Africa', 'Tanzania', '—', 'Dar es Salaam', -6.79, 39.21, 15],
    ['Africa', 'Nigeria', '—', 'Lagos', 6.52, 3.38, 40], ['Africa', 'Ghana', '—', 'Accra', 5.6, -0.19, 60],
    ['Africa', 'Senegal', '—', 'Dakar', 14.72, -17.47, 20], ['Africa', "Côte d'Ivoire", '—', 'Abidjan', 5.36, -4.01, 20],
    ['Africa', 'South Africa', 'Gauteng', 'Johannesburg', -26.2, 28.05, 1750], ['Africa', 'South Africa', 'Western Cape', 'Cape Town', -33.92, 18.42, 40],
    ['Africa', 'South Africa', 'KwaZulu-Natal', 'Durban', -29.86, 31.02, 10], ['Africa', 'Angola', '—', 'Luanda', -8.84, 13.23, 70],
    ['Mid-East', 'Saudi Arabia', 'Riyadh', 'Riyadh', 24.71, 46.68, 610], ['Mid-East', 'Saudi Arabia', 'Makkah', 'Jeddah', 21.49, 39.19, 15],
    ['Mid-East', 'Saudi Arabia', 'Makkah', 'Makkah', 21.39, 39.86, 280], ['Mid-East', 'Saudi Arabia', 'Madinah', 'Madinah', 24.47, 39.61, 610],
    ['Mid-East', 'Saudi Arabia', 'Eastern Province', 'Dammam', 26.43, 50.1, 10], ['Mid-East', 'Saudi Arabia', 'Eastern Province', 'Al Jubail', 27.0, 49.66, 5],
    ['Mid-East', 'Saudi Arabia', 'Eastern Province', 'Al Ahsa (Hofuf)', 25.38, 49.59, 160], ['Mid-East', 'Saudi Arabia', 'Qassim', 'Buraydah', 26.33, 43.97, 650],
    ['Mid-East', 'Saudi Arabia', 'Asir', 'Abha', 18.22, 42.5, 2200], ['Mid-East', 'Saudi Arabia', 'Asir', 'Khamis Mushait', 18.3, 42.73, 2000],
    ['Mid-East', 'Saudi Arabia', 'Tabuk', 'Tabuk', 28.38, 36.57, 770], ['Mid-East', 'Saudi Arabia', 'Jazan', 'Jazan', 16.89, 42.55, 5],
    ['Mid-East', 'Saudi Arabia', 'Hail', 'Hail', 27.52, 41.69, 990], ['Mid-East', 'Saudi Arabia', 'Makkah', 'Taif', 21.27, 40.42, 1500],
    ['Mid-East', 'United Arab Emirates', 'Dubai', 'Dubai', 25.2, 55.27, 10], ['Mid-East', 'United Arab Emirates', 'Abu Dhabi', 'Abu Dhabi', 24.45, 54.38, 10],
    ['Mid-East', 'United Arab Emirates', 'Abu Dhabi', 'Al Ain', 24.21, 55.74, 290], ['Mid-East', 'United Arab Emirates', 'Sharjah', 'Sharjah', 25.35, 55.42, 10],
    ['Mid-East', 'Qatar', '—', 'Doha', 25.29, 51.53, 10], ['Mid-East', 'Kuwait', '—', 'Kuwait City', 29.38, 47.99, 15],
    ['Mid-East', 'Bahrain', '—', 'Manama', 26.23, 50.59, 5], ['Mid-East', 'Oman', 'Muscat', 'Muscat', 23.59, 58.41, 15],
    ['Mid-East', 'Oman', 'Dhofar', 'Salalah', 17.02, 54.09, 20], ['Mid-East', 'Oman', 'Al Batinah', 'Sohar', 24.35, 56.71, 5],
    ['Mid-East', 'Jordan', '—', 'Amman', 31.95, 35.93, 780], ['Mid-East', 'Jordan', '—', 'Aqaba', 29.53, 35.01, 50],
    ['Mid-East', 'Lebanon', '—', 'Beirut', 33.89, 35.5, 20], ['Mid-East', 'Syria', '—', 'Damascus', 33.51, 36.28, 690],
    ['Mid-East', 'Iraq', '—', 'Baghdad', 33.31, 44.36, 35], ['Mid-East', 'Iraq', '—', 'Basra', 30.51, 47.78, 5],
    ['Mid-East', 'Iraq', 'Kurdistan', 'Erbil', 36.19, 44.01, 420], ['Mid-East', 'Yemen', '—', 'Aden', 12.79, 45.02, 10],
    ['Mid-East', 'Iran', '—', 'Tehran', 35.69, 51.39, 1190], ['Mid-East', 'Iran', '—', 'Bandar Abbas', 27.18, 56.27, 10],
    ['Asia', 'India', 'Maharashtra', 'Mumbai', 19.08, 72.88, 15], ['Asia', 'India', 'Delhi', 'New Delhi', 28.61, 77.21, 215],
    ['Asia', 'India', 'Tamil Nadu', 'Chennai', 13.08, 80.27, 10], ['Asia', 'India', 'Karnataka', 'Bengaluru', 12.97, 77.59, 920],
    ['Asia', 'India', 'Gujarat', 'Ahmedabad', 23.02, 72.57, 55], ['Asia', 'India', 'West Bengal', 'Kolkata', 22.57, 88.36, 10],
    ['Asia', 'Pakistan', 'Sindh', 'Karachi', 24.86, 67.0, 10], ['Asia', 'Pakistan', 'Punjab', 'Lahore', 31.55, 74.34, 215],
    ['Asia', 'Bangladesh', '—', 'Dhaka', 23.81, 90.41, 10], ['Asia', 'Sri Lanka', '—', 'Colombo', 6.93, 79.85, 5],
    ['Asia', 'China', 'Shanghai', 'Shanghai', 31.23, 121.47, 5], ['Asia', 'China', 'Beijing', 'Beijing', 39.9, 116.41, 45],
    ['Asia', 'China', 'Guangdong', 'Guangzhou', 23.13, 113.26, 20], ['Asia', 'Hong Kong', '—', 'Hong Kong', 22.32, 114.17, 5],
    ['Asia', 'Japan', 'Tokyo', 'Tokyo', 35.68, 139.69, 40], ['Asia', 'South Korea', '—', 'Seoul', 37.57, 126.98, 40],
    ['Asia', 'Singapore', '—', 'Singapore', 1.35, 103.82, 15], ['Asia', 'Malaysia', '—', 'Kuala Lumpur', 3.14, 101.69, 60],
    ['Asia', 'Thailand', '—', 'Bangkok', 13.76, 100.5, 5], ['Asia', 'Vietnam', '—', 'Ho Chi Minh City', 10.82, 106.63, 10],
    ['Asia', 'Indonesia', '—', 'Jakarta', -6.21, 106.85, 10], ['Asia', 'Philippines', '—', 'Manila', 14.6, 120.98, 10],
    ['Asia', 'Kazakhstan', '—', 'Almaty', 43.24, 76.95, 800], ['Asia', 'Uzbekistan', '—', 'Tashkent', 41.3, 69.24, 450],
    ['Europe', 'Turkey', '—', 'Istanbul', 41.01, 28.98, 40], ['Europe', 'Turkey', '—', 'Ankara', 39.93, 32.86, 940],
    ['Europe', 'Turkey', '—', 'Izmir', 38.42, 27.14, 25], ['Europe', 'Turkey', '—', 'Mersin', 36.81, 34.64, 10],
    ['Europe', 'United Kingdom', 'England', 'London', 51.51, -0.13, 25], ['Europe', 'Ireland', '—', 'Dublin', 53.35, -6.26, 20],
    ['Europe', 'France', '—', 'Paris', 48.86, 2.35, 35], ['Europe', 'Germany', '—', 'Hamburg', 53.55, 9.99, 10],
    ['Europe', 'Germany', '—', 'Frankfurt', 50.11, 8.68, 110], ['Europe', 'Netherlands', '—', 'Rotterdam', 51.92, 4.48, 0],
    ['Europe', 'Belgium', '—', 'Antwerp', 51.22, 4.4, 10], ['Europe', 'Denmark', '—', 'Copenhagen', 55.68, 12.57, 10],
    ['Europe', 'Norway', '—', 'Oslo', 59.91, 10.75, 20], ['Europe', 'Sweden', '—', 'Stockholm', 59.33, 18.07, 20],
    ['Europe', 'Poland', '—', 'Warsaw', 52.23, 21.01, 100], ['Europe', 'Spain', '—', 'Madrid', 40.42, -3.7, 650],
    ['Europe', 'Spain', '—', 'Valencia', 39.47, -0.38, 15], ['Europe', 'Portugal', '—', 'Lisbon', 38.72, -9.14, 50],
    ['Europe', 'Italy', '—', 'Milan', 45.46, 9.19, 120], ['Europe', 'Italy', '—', 'Rome', 41.9, 12.5, 20],
    ['Europe', 'Greece', '—', 'Athens', 37.98, 23.73, 70], ['Europe', 'Cyprus', '—', 'Limassol', 34.68, 33.04, 10],
    ['Europe', 'Russia', '—', 'Moscow', 55.76, 37.62, 150], ['Europe', 'Ukraine', '—', 'Odesa', 46.48, 30.72, 40],
    ['North & Central America', 'United States', 'California', 'Los Angeles', 34.05, -118.24, 90], ['North & Central America', 'United States', 'Texas', 'Houston', 29.76, -95.37, 15],
    ['North & Central America', 'United States', 'Illinois', 'Chicago', 41.88, -87.63, 180], ['North & Central America', 'United States', 'Georgia', 'Atlanta', 33.75, -84.39, 320],
    ['North & Central America', 'United States', 'Florida', 'Miami', 25.76, -80.19, 5], ['North & Central America', 'United States', 'New York', 'New York', 40.71, -74.01, 10],
    ['North & Central America', 'United States', 'Washington', 'Seattle', 47.61, -122.33, 50], ['North & Central America', 'Canada', 'Ontario', 'Toronto', 43.65, -79.38, 80],
    ['North & Central America', 'Canada', 'British Columbia', 'Vancouver', 49.28, -123.12, 5], ['North & Central America', 'Mexico', '—', 'Mexico City', 19.43, -99.13, 2240],
    ['North & Central America', 'Mexico', '—', 'Monterrey', 25.69, -100.32, 540], ['North & Central America', 'Panama', '—', 'Panama City', 8.98, -79.52, 10],
    ['South America', 'Brazil', 'São Paulo', 'São Paulo', -23.55, -46.63, 760], ['South America', 'Brazil', 'Rio de Janeiro', 'Rio de Janeiro', -22.91, -43.17, 10],
    ['South America', 'Argentina', '—', 'Buenos Aires', -34.6, -58.38, 25], ['South America', 'Chile', '—', 'Santiago', -33.45, -70.67, 570],
    ['South America', 'Peru', '—', 'Lima', -12.05, -77.04, 150], ['South America', 'Colombia', '—', 'Bogotá', 4.71, -74.07, 2640],
    ['South America', 'Ecuador', '—', 'Guayaquil', -2.17, -79.92, 5], ['South America', 'Uruguay', '—', 'Montevideo', -34.9, -56.16, 40],
    ['South West Pacific', 'Australia', 'New South Wales', 'Sydney', -33.87, 151.21, 40], ['South West Pacific', 'Australia', 'Victoria', 'Melbourne', -37.81, 144.96, 30],
    ['South West Pacific', 'Australia', 'Queensland', 'Brisbane', -27.47, 153.03, 30], ['South West Pacific', 'Australia', 'Western Australia', 'Perth', -31.95, 115.86, 30],
    ['South West Pacific', 'New Zealand', '—', 'Auckland', -36.85, 174.76, 30], ['South West Pacific', 'New Zealand', '—', 'Christchurch', -43.53, 172.64, 20],
  ];

  function seedRecords() {
    return SEED.map(([region, country, state, city, lat, lon, elevation]) => ({
      id: `seed:${country}:${state}:${city}`.toLowerCase().replace(/\s+/g, '-'),
      region, country, state, city, lat, lon, elevation,
      db04: '', db1: '', mcwb04: '', mcwb1: '', db996: '', groundT: '',
      source: '', edition: '', status: 'seed',
    }));
  }

  /** Relative humidity [%] from dry-bulb and wet-bulb (psychrometric), at pressure p [kPa]. */
  function rhFromWB(tdb, twb, p, Psychro) {
    const Ws = Psychro.humRatio(twb, 100, p);
    const W = ((2501 - 2.326 * twb) * Ws - 1.006 * (tdb - twb)) / (2501 + 1.86 * tdb - 4.186 * twb);
    const pw = W * p / (0.621945 + W);
    return Math.max(0, Math.min(100, pw / Psychro.pws(tdb) * 100));
  }

  const api = { REGIONS, seedRecords, rhFromWB };
  root.CL = root.CL || {};
  root.CL.climate = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
