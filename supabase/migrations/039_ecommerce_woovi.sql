-- 1. Enum para status de onboarding da Woovi
CREATE TYPE woovi_onboarding_status AS ENUM ('none', 'pending_approval', 'approved');

-- 2. Tabela de configuração Woovi do Tenant
CREATE TABLE IF NOT EXISTS woovi_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE UNIQUE,
    onboarding_status woovi_onboarding_status NOT NULL DEFAULT 'none',
    app_id TEXT, -- Armazenado criptografado
    secret_key TEXT, -- Armazenado criptografado
    default_shipping_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00, -- Frete padrão da loja
    store_description TEXT, -- Biografia/Descrição da loja pública
    store_logo_url TEXT, -- URL do logotipo da loja pública
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS para woovi_config
ALTER TABLE woovi_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can manage their own woovi_config" 
    ON woovi_config FOR ALL 
    USING (account_id = auth.uid() OR account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- 3. Categorias de Produtos
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (account_id, slug)
);

-- Habilitar RLS para product_categories
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active categories" 
    ON product_categories FOR SELECT 
    USING (true);
CREATE POLICY "Tenants can manage their own categories" 
    ON product_categories FOR ALL 
    USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- 4. Tabela Principal de Produtos
CREATE TYPE product_type_enum AS ENUM ('physical', 'digital');

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    images TEXT[] DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT true,
    product_type product_type_enum NOT NULL DEFAULT 'physical',
    digital_content TEXT,
    repurchase_reminder_days INT,
    shipping_fee NUMERIC(10, 2),
    upsell_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (account_id, slug)
);

-- Habilitar RLS para products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active products" 
    ON products FOR SELECT 
    USING (active = true);
CREATE POLICY "Tenants can manage their own products" 
    ON products FOR ALL 
    USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- 5. Variações Físicas dos Produtos (Preços e Estoques)
CREATE TABLE IF NOT EXISTS product_variations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku TEXT,
    price NUMERIC(10, 2) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS para product_variations
ALTER TABLE product_variations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active variations" 
    ON product_variations FOR SELECT 
    USING (product_id IN (SELECT id FROM products WHERE active = true));
CREATE POLICY "Tenants can manage their own variations" 
    ON product_variations FOR ALL 
    USING (product_id IN (SELECT id FROM products WHERE account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid())));

-- 6. Endereços de Entrega dos Clientes (vinculados ao Contato CRM)
CREATE TABLE IF NOT EXISTS shipping_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    label TEXT DEFAULT 'Casa',
    street TEXT NOT NULL,
    number TEXT NOT NULL,
    complement TEXT,
    neighborhood TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS para shipping_addresses
ALTER TABLE shipping_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can view contact addresses"
    ON shipping_addresses FOR ALL
    USING (contact_id IN (SELECT id FROM contacts WHERE account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "Public can view and insert shipping addresses during checkout"
    ON shipping_addresses FOR ALL
    USING (true);

-- 7. Pedidos (Orders)
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'cancelled');

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    status order_status NOT NULL DEFAULT 'pending',
    shipping_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    items_amount NUMERIC(10, 2) NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    customer_info JSONB NOT NULL,
    shipping_address_id UUID REFERENCES shipping_addresses(id) ON DELETE SET NULL,
    woovi_correlation_id TEXT UNIQUE,
    woovi_qrcode_image TEXT,
    woovi_brcode TEXT,
    repurchase_reminder_at TIMESTAMP WITH TIME ZONE,
    repurchase_reminder_sent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS para orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can view and manage their own orders" 
    ON orders FOR ALL 
    USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Public can view and read their own order via ID" 
    ON orders FOR SELECT 
    USING (true);
CREATE POLICY "Public can insert order" 
    ON orders FOR INSERT 
    WITH CHECK (true);

-- 8. Itens do Pedido (Order Items)
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_variation_id UUID NOT NULL REFERENCES product_variations(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL,
    is_upsell BOOLEAN NOT NULL DEFAULT false
);

-- Habilitar RLS para order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can manage their own order items" 
    ON order_items FOR ALL 
    USING (order_id IN (SELECT id FROM orders WHERE account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "Public can insert order items" 
    ON order_items FOR INSERT 
    WITH CHECK (true);
CREATE POLICY "Public can view order items" 
    ON order_items FOR SELECT 
    USING (true);
