'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Product, ProductCategory, ProductVariation } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Upload, Link2, Info } from 'lucide-react';
import { toast } from 'sonner';

interface ProductFormProps {
  accountId: string;
  product?: Product & { variations?: ProductVariation[] }; // if edit
  onSave: () => void;
  onCancel: () => void;
}

export function ProductForm({ accountId, product, onSave, onCancel }: ProductFormProps) {
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [otherProducts, setOtherProducts] = useState<Product[]>([]);

  // Product fields
  const [name, setName] = useState(product?.name || '');
  const [slug, setSlug] = useState(product?.slug || '');
  const [description, setDescription] = useState(product?.description || '');
  const [categoryId, setCategoryId] = useState(product?.category_id || 'none');
  const [active, setActive] = useState(product?.active ?? true);
  const [productType, setProductType] = useState<'physical' | 'digital'>(product?.product_type || 'physical');
  const [digitalContent, setDigitalContent] = useState(product?.digital_content || '');
  const [repurchaseDays, setRepurchaseDays] = useState(product?.repurchase_reminder_days?.toString() || '');
  const [shippingFee, setShippingFee] = useState(product?.shipping_fee?.toString() || '');
  const [upsellProductId, setUpsellProductId] = useState(product?.upsell_product_id || 'none');
  const [images, setImages] = useState<string[]>(product?.images || []);
  const [newImageUrl, setNewImageUrl] = useState('');

  // Variations list
  const [variations, setVariations] = useState<Partial<ProductVariation>[]>(
    product?.variations || [{ price: 0, stock: 10, attributes: { tam: 'Único' } }]
  );

  useEffect(() => {
    // Load categories and other products for upsell dropdown
    async function loadFormMetadata() {
      try {
        const { data: cats } = await supabase
          .from('product_categories')
          .select('*')
          .eq('account_id', accountId)
          .order('name');
        
        const { data: prods } = await supabase
          .from('products')
          .select('*')
          .eq('account_id', accountId)
          .order('name');

        if (cats) setCategories(cats);
        if (prods) {
          // Exclude current product from upsell options
          setOtherProducts(product ? prods.filter(p => p.id !== product.id) : prods);
        }
      } catch (err) {
        console.error(err);
      }
    }

    loadFormMetadata();
  }, [accountId, product, supabase]);

  // Handle Slug generation on name change
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!product) {
      setSlug(
        val
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_]+/g, '-')
          .replace(/^-+|-+$/g, '')
      );
    }
  };

  // Add variation row
  const addVariation = () => {
    setVariations([
      ...variations,
      { price: variations[0]?.price || 0, stock: 10, attributes: { tam: '', cor: '' } }
    ]);
  };

  // Remove variation row
  const removeVariation = (index: number) => {
    if (variations.length <= 1) {
      toast.error('O produto precisa ter pelo menos uma variação.');
      return;
    }
    setVariations(variations.filter((_, i) => i !== index));
  };

  // Update variation row value
  const updateVariation = (index: number, field: keyof ProductVariation | 'attributes', value: any) => {
    const updated = [...variations];
    if (field === 'attributes') {
      updated[index].attributes = { ...updated[index].attributes, ...value };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setVariations(updated);
  };

  // Image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${accountId}/products/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `public/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('profiles').getPublicUrl(filePath);
      setImages([...images, data.publicUrl]);
      toast.success('Imagem carregada com sucesso!');
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao fazer upload da imagem.');
    } finally {
      setLoading(false);
    }
  };

  // Add Image URL directly
  const addImageUrl = () => {
    if (!newImageUrl.startsWith('http')) {
      toast.error('Insira uma URL de imagem válida.');
      return;
    }
    setImages([...images, newImageUrl]);
    setNewImageUrl('');
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  // Save product form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) {
      toast.error('Nome e slug são obrigatórios.');
      return;
    }

    try {
      setLoading(true);

      const productPayload = {
        account_id: accountId,
        category_id: categoryId === 'none' ? null : categoryId,
        name,
        slug,
        description,
        images,
        active,
        product_type: productType,
        digital_content: productType === 'digital' ? digitalContent : null,
        repurchase_reminder_days: parseInt(repurchaseDays) || null,
        shipping_fee: productType === 'physical' && shippingFee ? parseFloat(shippingFee) : null,
        upsell_product_id: upsellProductId === 'none' ? null : upsellProductId,
        updated_at: new Date().toISOString()
      };

      let productId = product?.id;

      if (product) {
        // 1. Update Product
        const { error } = await supabase
          .from('products')
          .update(productPayload)
          .eq('id', product.id);

        if (error) throw error;
      } else {
        // 2. Create Product
        const { data, error } = await supabase
          .from('products')
          .insert(productPayload)
          .select()
          .single();

        if (error) throw error;
        productId = data.id;
      }

      // Handle Variations update
      if (productId) {
        // For simplicity: delete old variations and re-insert new ones (or update selectively)
        // ponytail: delete-and-reinsert guarantees alignment with form list
        if (product) {
          const { error: deleteError } = await supabase
            .from('product_variations')
            .delete()
            .eq('product_id', productId);
          
          if (deleteError) throw deleteError;
        }

        const variationsPayload = variations.map(v => ({
          product_id: productId,
          sku: v.sku || null,
          price: parseFloat(v.price?.toString() || '0') || 0,
          stock: parseInt(v.stock?.toString() || '0') || 0,
          attributes: v.attributes || {}
        }));

        const { error: variationsError } = await supabase
          .from('product_variations')
          .insert(variationsPayload);

        if (variationsError) throw variationsError;
      }

      toast.success(product ? 'Produto atualizado!' : 'Produto cadastrado com sucesso!');
      onSave();
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao salvar produto. Verifique se o Slug já está em uso.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Tabs defaultValue="geral" className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-muted/50 rounded-lg">
              <TabsTrigger value="geral">Dados Gerais</TabsTrigger>
              <TabsTrigger value="imagens">Imagens</TabsTrigger>
              <TabsTrigger value="variacoes">Estoque e Preços</TabsTrigger>
              <TabsTrigger value="marketing">Marketing (Upsell/Recompra)</TabsTrigger>
            </TabsList>

            {/* TAB 1: Geral */}
            <TabsContent value="geral" className="space-y-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Produto</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={handleNameChange}
                    placeholder="Ex: Ebook Mentoria de Vendas"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug (URL amigável)</Label>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="ex-ebook-mentoria-de-vendas"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="desc">Descrição do Produto</Label>
                <Textarea
                  id="desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva os benefícios, conteúdo e cronograma do produto..."
                  rows={4}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={categoryId} onValueChange={(val) => setCategoryId(val || 'none')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Produto</Label>
                  <Select
                    value={productType}
                    onValueChange={(val) => setProductType(val as 'physical' | 'digital' || 'physical')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physical">Físico (com frete e estoque)</SelectItem>
                      <SelectItem value="digital">Digital (Ebook, Mentoria, Serviço)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2 pt-8">
                  <Switch checked={active} onCheckedChange={setActive} id="active" />
                  <Label htmlFor="active">Produto Ativo na Loja</Label>
                </div>
              </div>

              {productType === 'digital' ? (
                <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <Label htmlFor="digitalContent" className="flex items-center gap-1.5 text-primary">
                    <Info className="h-4 w-4" />
                    Conteúdo Digital (Entregue no WhatsApp pós-pagamento)
                  </Label>
                  <Textarea
                    id="digitalContent"
                    value={digitalContent}
                    onChange={(e) => setDigitalContent(e.target.value)}
                    placeholder="Insira o link para download do ebook, link do grupo do telegram ou instruções para agendamento da mentoria."
                    rows={3}
                    required={productType === 'digital'}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Este conteúdo será enviado por WhatsApp automaticamente para o cliente assim que o pagamento Pix for confirmado.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="shippingFee">Taxa de Frete Específica (R$)</Label>
                  <Input
                    id="shippingFee"
                    type="number"
                    step="0.01"
                    placeholder="Deixe em branco para usar o frete padrão da loja"
                    value={shippingFee}
                    onChange={(e) => setShippingFee(e.target.value)}
                  />
                </div>
              )}
            </TabsContent>

            {/* TAB 2: Imagens */}
            <TabsContent value="imagens" className="space-y-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 rounded-lg border border-dashed border-muted-foreground p-6 text-center">
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground opacity-75 mb-2" />
                  <Label className="cursor-pointer text-sm font-semibold text-primary block hover:underline">
                    Fazer Upload de Imagem
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">Salva diretamente no Supabase Storage</p>
                </div>

                <div className="space-y-2">
                  <Label>Adicionar por URL Externa</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://exemplo.com/imagem.jpg"
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                    />
                    <Button type="button" onClick={addImageUrl} size="sm">
                      <Link2 className="h-4 w-4 mr-1" /> Add
                    </Button>
                  </div>
                </div>
              </div>

              {images.length > 0 && (
                <div className="mt-4">
                  <Label className="block mb-2">Imagens Selecionadas</Label>
                  <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
                    {images.map((img, i) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border border-border h-20 w-full bg-muted">
                        <img src={img} alt="Preview" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                        >
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB 3: Variações */}
            <TabsContent value="variacoes" className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Preços e Variações</h3>
                  <p className="text-xs text-muted-foreground">Cadastre variações de preços e estoque (ex: tamanho, cor ou plano).</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addVariation}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar Variação
                </Button>
              </div>

              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border text-muted-foreground font-medium text-xs">
                      <th className="p-3">Atributos (Ex: tam: G, cor: Preto)</th>
                      <th className="p-3 w-36">Preço (R$)</th>
                      <th className="p-3 w-28">Estoque</th>
                      <th className="p-3 w-36">SKU (opcional)</th>
                      <th className="p-3 w-14"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {variations.map((v, i) => {
                      const attrs = v.attributes || {};
                      const attrString = Object.entries(attrs)
                        .map(([k, val]) => `${k}:${val}`)
                        .join(', ');

                      return (
                        <tr key={i} className="border-b border-border hover:bg-muted/30">
                          <td className="p-3">
                            <div className="flex gap-2">
                              <Input
                                placeholder="tamanho"
                                className="h-8 text-xs"
                                value={Object.keys(attrs)[0] || ''}
                                onChange={(e) => {
                                  const oldVal = Object.values(attrs)[0] || '';
                                  updateVariation(i, 'attributes', { [e.target.value]: oldVal });
                                }}
                              />
                              <Input
                                placeholder="M"
                                className="h-8 text-xs"
                                value={Object.values(attrs)[0] || ''}
                                onChange={(e) => {
                                  const oldKey = Object.keys(attrs)[0] || 'tam';
                                  updateVariation(i, 'attributes', { [oldKey]: e.target.value });
                                }}
                              />
                            </div>
                          </td>
                          <td className="p-3">
                            <Input
                              type="number"
                              step="0.01"
                              value={v.price}
                              onChange={(e) => updateVariation(i, 'price', e.target.value)}
                              className="h-8"
                              required
                            />
                          </td>
                          <td className="p-3">
                            <Input
                              type="number"
                              value={v.stock}
                              onChange={(e) => updateVariation(i, 'stock', e.target.value)}
                              className="h-8"
                              required
                            />
                          </td>
                          <td className="p-3">
                            <Input
                              type="text"
                              value={v.sku || ''}
                              onChange={(e) => updateVariation(i, 'sku', e.target.value)}
                              className="h-8"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeVariation(i)}
                              className="text-rose-500 hover:text-rose-600 focus:outline-none"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* TAB 4: Marketing */}
            <TabsContent value="marketing" className="space-y-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="repurchase">Lembrete de Recompra (Dias)</Label>
                  <Input
                    id="repurchase"
                    type="number"
                    placeholder="Ex: 30"
                    value={repurchaseDays}
                    onChange={(e) => setRepurchaseDays(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Lembrete automático enviado no chat sugerindo a compra novamente após X dias da aprovação do pagamento. Deixe vazio para desativar.</p>
                </div>

                <div className="space-y-2">
                  <Label>Oferta de Upsell no Checkout</Label>
                  <Select value={upsellProductId} onValueChange={(val) => setUpsellProductId(val || 'none')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um produto..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {otherProducts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Produto recomendado para compra rápida que será sugerido no carrinho/checkout do cliente.</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end space-x-3 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : product ? 'Salvar Alterações' : 'Cadastrar Produto'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
