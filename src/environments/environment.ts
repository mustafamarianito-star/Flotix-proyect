export const environment = {
  production: false,

  // Datos del proyecto de Supabase (Project Settings > API).
  supabaseUrl: 'https://jtrkbybaxjkujdxkniza.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cmtieWJheGprdWpkeGtuaXphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNTcyMTYsImV4cCI6MjA5OTYzMzIxNn0.yDhQAKT8RrFKXLu_oe1itwtm8wBj7lz913OBVy-kym4',

  // El login con Google ahora se configura directamente en Supabase
  // (Authentication > Providers > Google), con el mismo Client ID/Secret
  // de Google Cloud Console. Ya no hace falta el Client ID acá.
};
