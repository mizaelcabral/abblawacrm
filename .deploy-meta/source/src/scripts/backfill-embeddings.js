const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Read .env.local
const envPath = path.join(__dirname, '../../.env.local');
if (!fs.existsSync(envPath)) {
  console.error('.env.local file not found!');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const getEnvVar = (name) => {
  const match = envContent.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
};

const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');
const geminiApiKey = getEnvVar('GEMINI_API_KEY');

if (!supabaseUrl || !supabaseKey || !geminiApiKey) {
  console.error('Missing configuration in .env.local:', { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey, geminiApiKey: !!geminiApiKey });
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function backfill() {
  console.log('Fetching articles with missing embeddings...');
  const { data: articles, error } = await supabase
    .from('knowledge_base')
    .select('id, title, content')
    .is('embedding', null);

  if (error) {
    console.error('Error fetching articles:', error);
    process.exit(1);
  }

  console.log(`Found ${articles.length} articles to update.`);

  for (const article of articles) {
    console.log(`Generating embedding for: "${article.title}"...`);
    const textToEmbed = `${article.title}\n\n${article.content}`;
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: { parts: [{ text: textToEmbed }] },
            outputDimensionality: 768,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const resJson = await response.json();
      const embedding = resJson.embedding?.values;

      if (!embedding || embedding.length !== 768) {
        throw new Error('Invalid embedding vector returned');
      }

      const { error: updateError } = await supabase
        .from('knowledge_base')
        .update({ embedding })
        .eq('id', article.id);

      if (updateError) {
        throw new Error(`DB update error: ${updateError.message}`);
      }

      console.log(`Successfully updated: "${article.title}"`);
    } catch (err) {
      console.error(`Failed to update article "${article.title}":`, err.message);
    }
  }

  console.log('Backfill completed.');
}

backfill();
