"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { FormActions, ModuleHeader, Notice } from "@/components/crud-ui";
import { moneyInput } from "@/lib/client-utils";
import { formatIDR } from "@/lib/format";

type Customer = {
  id: string;
  name: string;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
};

type NewCustomer = {
  name: string;
  whatsapp: string;
  email: string;
  address: string;
};

type Catalog = { id: string; name: string; unit: string; price: number | string };
type Opt = { label: string; value: string };
type Field = {
  id: string;
  label: string;
  field_type: string;
  placeholder: string | null;
  is_required: boolean;
  custom_field_options?: Opt[];
};
type PayMethod = { id: string; name: string; type: string };
type Item = {
  catalog_item_id: string;
  name: string;
  qty: string;
  unit: string;
  unit_price: string;
  line_discount: string;
  description: string;
};

const newItem = (): Item => ({
  catalog_item_id: "",
  name: "",
  qty: "1",
  unit: "pcs",
  unit_price: "0",
  line_discount: "0",
  description: "",
});

const emptyNewCustomer: NewCustomer = { name: "", whatsapp: "", email: "", address: "" };

export function OrderCreateForm({ businessId, role }: { businessId: string; role: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [methods, setMethods] = useState<PayMethod[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [newCustomer, setNewCustomer] = useState<NewCustomer>(emptyNewCustomer);

  const [status, setStatus] = useState("confirmed");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState("0");
  const [fee, setFee] = useState("0");
  const [tax, setTax] = useState("0");
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [cf, setCf] = useState<Record<string, string | boolean | string[]>>({});
  const [initialAmount, setInitialAmount] = useState("0");
  const [initialMethod, setInitialMethod] = useState("cash");
  const [initialRef, setInitialRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const canPay = role === "owner" || role === "admin" || role === "finance";

  useEffect(() => {
    void (async () => {
      const [c, cat, f, m] = await Promise.all([
        supabase
          .from("customers")
          .select("id,name,whatsapp,email,address")
          .eq("business_id", businessId)
          .is("deleted_at", null)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("catalog_items")
          .select("id,name,unit,price")
          .eq("business_id", businessId)
          .is("deleted_at", null)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("custom_field_definitions")
          .select("id,label,field_type,placeholder,is_required,custom_field_options(label,value)")
          .eq("business_id", businessId)
          .eq("entity_type", "order")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("payment_methods")
          .select("id,name,type")
          .eq("business_id", businessId)
          .eq("is_active", true)
          .order("sort_order"),
      ]);

      setCustomers((c.data ?? []) as Customer[]);
      setCatalog((cat.data ?? []) as Catalog[]);
      setFields((f.data ?? []) as unknown as Field[]);
      setMethods((m.data ?? []) as PayMethod[]);
      if ((m.data ?? []).length) setInitialMethod(String(m.data?.[0]?.name ?? "cash"));
    })();
  }, [businessId, supabase]);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const normalizedCustomerQuery = customerQuery.trim().toLowerCase();
  const customerMatches = customers
    .filter((c) => {
      if (!normalizedCustomerQuery) return true;
      return `${c.name} ${c.whatsapp ?? ""} ${c.email ?? ""}`.toLowerCase().includes(normalizedCustomerQuery);
    })
    .slice(0, 8);

  function selectCustomer(customer: Customer) {
    setCustomerId(customer.id);
    setCustomerQuery(customer.name);
    setCustomerPickerOpen(false);
    setNewCustomerMode(false);
    setNewCustomer(emptyNewCustomer);
  }

  function startNewCustomer() {
    setCustomerId("");
    setNewCustomerMode(true);
    setCustomerPickerOpen(false);
    setNewCustomer({ ...emptyNewCustomer, name: customerQuery.trim() });
  }

  function resetCustomer() {
    setCustomerId("");
    setCustomerQuery("");
    setCustomerPickerOpen(true);
    setNewCustomerMode(false);
    setNewCustomer(emptyNewCustomer);
  }

  function chooseCatalog(index: number, id: string) {
    const p = catalog.find((x) => x.id === id);
    setItems((old) =>
      old.map((it, i) =>
        i === index
          ? p
            ? { ...it, catalog_item_id: p.id, name: p.name, unit: p.unit, unit_price: String(p.price) }
            : { ...it, catalog_item_id: "" }
          : it,
      ),
    );
  }

  function updateItem(index: number, key: keyof Item, value: string) {
    setItems((old) => old.map((it, i) => (i === index ? { ...it, [key]: value } : it)));
  }

  const subtotal = items.reduce(
    (sum, it) => sum + Math.max(0, Number(it.qty || 0) * moneyInput(it.unit_price) - moneyInput(it.line_discount)),
    0,
  );
  const grand = Math.max(0, subtotal - moneyInput(discount) + moneyInput(fee) + moneyInput(tax));

  function fieldInput(f: Field) {
    const value = cf[f.id];
    const set = (v: string | boolean | string[]) => setCf((x) => ({ ...x, [f.id]: v }));
    if (f.field_type === "boolean")
      return (
        <select value={String(value ?? "")} onChange={(e) => set(e.target.value === "true")}>
          <option value="">Pilih...</option>
          <option value="true">Ya</option>
          <option value="false">Tidak</option>
        </select>
      );
    if (f.field_type === "select")
      return (
        <select value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
          <option value="">Pilih...</option>
          {(f.custom_field_options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    if (f.field_type === "multiselect")
      return (
        <input
          value={Array.isArray(value) ? value.join(", ") : ""}
          onChange={(e) => set(e.target.value.split(",").map((x: string) => x.trim()).filter(Boolean))}
          placeholder="Pisahkan dengan koma"
        />
      );
    if (f.field_type === "text_long" || f.field_type === "address")
      return <textarea value={String(value ?? "")} onChange={(e) => set(e.target.value)} placeholder={f.placeholder ?? ""} />;
    const type =
      f.field_type === "date"
        ? "date"
        : f.field_type === "time"
          ? "time"
          : f.field_type === "number" || f.field_type === "money"
            ? "number"
            : "text";
    return <input type={type} value={String(value ?? "")} onChange={(e) => set(e.target.value)} placeholder={f.placeholder ?? ""} />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");

    if (!newCustomerMode && !customerId) return setMsg("Pilih pelanggan lama atau isi pelanggan baru.");
    if (newCustomerMode && !newCustomer.name.trim()) return setMsg("Nama pelanggan baru wajib diisi.");
    if (items.some((i) => !i.name.trim() || Number(i.qty) <= 0)) return setMsg("Setiap item wajib punya nama dan qty lebih dari 0.");

    for (const f of fields.filter((x) => x.is_required)) {
      const v = cf[f.id];
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return setMsg(`Field ${f.label} wajib diisi.`);
    }

    setSaving(true);

    let resolvedCustomerId = customerId;
    let createdCustomer: Customer | null = null;

    if (newCustomerMode) {
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .insert({
          business_id: businessId,
          name: newCustomer.name.trim(),
          whatsapp: newCustomer.whatsapp.trim() || null,
          email: newCustomer.email.trim() || null,
          address: newCustomer.address.trim() || null,
          is_active: true,
        })
        .select("id,name,whatsapp,email,address")
        .single();

      if (customerError || !customerData) {
        setSaving(false);
        return setMsg(customerError?.message ?? "Pelanggan baru gagal disimpan.");
      }

      createdCustomer = customerData as Customer;
      resolvedCustomerId = createdCustomer.id;
    }

    const custom_fields = fields
      .filter((f) => cf[f.id] !== undefined && cf[f.id] !== "")
      .map((f) => {
        let value: unknown = cf[f.id];
        if (f.field_type === "number" || f.field_type === "money") value = Number(value);
        return { definition_id: f.id, value };
      });

    const payload = {
      customer_id: resolvedCustomerId,
      status,
      order_date: orderDate,
      expected_date: expectedDate || null,
      due_date: dueDate || null,
      discount_total: moneyInput(discount),
      additional_fee_total: moneyInput(fee),
      tax_total: moneyInput(tax),
      customer_notes: customerNotes || null,
      internal_notes: internalNotes || null,
      items: items.map((it, i) => ({
        catalog_item_id: it.catalog_item_id || null,
        name: it.name.trim(),
        description: it.description || null,
        qty: Number(it.qty),
        unit: it.unit || "pcs",
        unit_price: moneyInput(it.unit_price),
        line_discount: moneyInput(it.line_discount),
        sort_order: i * 10,
      })),
      custom_fields,
      ...(canPay && moneyInput(initialAmount) > 0
        ? { initial_payment: { amount: moneyInput(initialAmount), method: initialMethod, reference: initialRef || null } }
        : {}),
    };

    const { data, error } = await supabase.rpc("create_order", { p_business_id: businessId, p_payload: payload });
    setSaving(false);

    if (error) {
      if (createdCustomer) {
        setCustomers((old) => [...old, createdCustomer!].sort((a, b) => a.name.localeCompare(b.name)));
        setCustomerId(createdCustomer.id);
        setCustomerQuery(createdCustomer.name);
        setNewCustomerMode(false);
        setNewCustomer(emptyNewCustomer);
        return setMsg(`Pelanggan ${createdCustomer.name} sudah tersimpan, tetapi order gagal dibuat: ${error.message}`);
      }
      return setMsg(error.message);
    }

    const orderId = String((data as Record<string, unknown>)?.order_id ?? "");
    router.push(orderId ? `/orders/${orderId}` : "/orders");
    router.refresh();
  }

  return (
    <>
      <ModuleHeader title="Catat Order" subtitle="Pelanggan, order & invoice dalam satu langkah" backHref="/orders" />
      {msg ? <Notice kind="error">{msg}</Notice> : null}

      <form onSubmit={submit}>
        <section className="formPanel customerQuickPanel">
          <div className="sectionTitleRow">
            <div>
              <h2>Pelanggan</h2>
              <p>Cari pelanggan lama atau langsung isi pelanggan baru tanpa keluar dari halaman order.</p>
            </div>
          </div>

          {selectedCustomer && !newCustomerMode ? (
            <div className="selectedCustomerCard">
              <div className="selectedCustomerIcon"><Check size={17} /></div>
              <div className="selectedCustomerText">
                <strong>{selectedCustomer.name}</strong>
                <span>{selectedCustomer.whatsapp || selectedCustomer.email || "Kontak belum diisi"}</span>
              </div>
              <button type="button" className="customerChangeButton" onClick={resetCustomer}>Ganti</button>
            </div>
          ) : newCustomerMode ? (
            <div className="inlineCustomerForm">
              <div className="inlineCustomerBadge"><UserPlus size={15} /> Pelanggan Baru</div>
              <div className="fieldGrid">
                <label className="formField full">
                  Nama Pelanggan *
                  <input
                    autoFocus
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                    placeholder="Contoh: Siti Rahma"
                  />
                </label>
                <label className="formField">
                  WhatsApp
                  <input
                    value={newCustomer.whatsapp}
                    onChange={(e) => setNewCustomer({ ...newCustomer, whatsapp: e.target.value })}
                    placeholder="08xxxxxxxxxx"
                    inputMode="tel"
                  />
                </label>
                <label className="formField">
                  Email
                  <input
                    type="email"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    placeholder="opsional@email.com"
                  />
                </label>
                <label className="formField full">
                  Alamat
                  <textarea
                    value={newCustomer.address}
                    onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                    placeholder="Opsional"
                  />
                </label>
              </div>
              <div className="inlineCustomerFoot">
                <span>Pelanggan otomatis tersimpan ke menu Pelanggan saat order disimpan.</span>
                <button type="button" onClick={resetCustomer}><X size={14} /> Pilih pelanggan lama</button>
              </div>
            </div>
          ) : (
            <div className="customerPicker">
              <div className="customerSearchInput">
                <Search size={17} />
                <input
                  autoFocus
                  value={customerQuery}
                  onChange={(e) => {
                    setCustomerQuery(e.target.value);
                    setCustomerId("");
                    setCustomerPickerOpen(true);
                  }}
                  onFocus={() => setCustomerPickerOpen(true)}
                  placeholder="Cari nama / WhatsApp, atau ketik nama pelanggan baru..."
                />
              </div>

              {customerPickerOpen ? (
                <div className="customerPickerResults">
                  {customerMatches.length ? (
                    customerMatches.map((customer) => (
                      <button type="button" className="customerResult" key={customer.id} onClick={() => selectCustomer(customer)}>
                        <span className="customerResultAvatar">{customer.name.slice(0, 1).toUpperCase()}</span>
                        <span className="customerResultText">
                          <strong>{customer.name}</strong>
                          <small>{customer.whatsapp || customer.email || "Kontak belum diisi"}</small>
                        </span>
                        <span className="customerResultUse">Pilih</span>
                      </button>
                    ))
                  ) : (
                    <div className="customerNoMatch">Belum ada pelanggan yang cocok.</div>
                  )}

                  <button type="button" className="customerNewAction" onClick={startNewCustomer}>
                    <UserPlus size={17} />
                    <span>
                      <strong>{customerQuery.trim() ? `Tambah “${customerQuery.trim()}” sebagai pelanggan baru` : "Tambah pelanggan baru"}</strong>
                      <small>Isi cepat di sini, tidak perlu pindah menu.</small>
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="formPanel">
          <h2>Informasi Order</h2>
          <div className="fieldGrid">
            <label className="formField">Tanggal Order<input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></label>
            <label className="formField">Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="draft">Draft</option><option value="confirmed">Dikonfirmasi</option><option value="in_progress">Diproses</option><option value="ready">Siap</option><option value="completed">Selesai</option></select></label>
            <label className="formField">Tanggal Selesai/Kirim<input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></label>
            <label className="formField">Jatuh Tempo<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
          </div>
        </section>

        <section className="formPanel">
          <h2>Item Pesanan</h2>
          <div className="itemEditor">
            {items.map((it, i) => (
              <div key={i}>
                <div className="itemEditorRow">
                  <input list={`catalog-${i}`} value={it.name} onChange={(e) => updateItem(i, "name", e.target.value)} placeholder="Nama item" />
                  <input value={it.qty} onChange={(e) => updateItem(i, "qty", e.target.value)} inputMode="decimal" placeholder="Qty" />
                  <input value={it.unit_price} onChange={(e) => updateItem(i, "unit_price", e.target.value)} inputMode="numeric" placeholder="Harga" />
                  <button type="button" className="removeItem" onClick={() => setItems((x) => (x.length > 1 ? x.filter((_, idx) => idx !== i) : x))}><Trash2 size={15} /></button>
                </div>
                <div className="fieldGrid" style={{ marginTop: 6 }}>
                  <label className="formField">Ambil dari katalog<select value={it.catalog_item_id} onChange={(e) => chooseCatalog(i, e.target.value)}><option value="">Manual</option>{catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                  <label className="formField">Satuan<input value={it.unit} onChange={(e) => updateItem(i, "unit", e.target.value)} /></label>
                  <label className="formField">Diskon Item<input value={it.line_discount} onChange={(e) => updateItem(i, "line_discount", e.target.value)} inputMode="numeric" /></label>
                  <label className="formField">Catatan<input value={it.description} onChange={(e) => updateItem(i, "description", e.target.value)} /></label>
                </div>
              </div>
            ))}
            <button type="button" className="addLine" onClick={() => setItems((x) => [...x, newItem()])}><Plus size={16} /> Tambah Item</button>
          </div>
        </section>

        {fields.length ? (
          <section className="formPanel">
            <h2>Detail Usaha</h2>
            <div className="fieldGrid">
              {fields.map((f) => (
                <label className={`formField ${f.field_type === "text_long" || f.field_type === "address" ? "full" : ""}`} key={f.id}>
                  {f.label}{f.is_required ? " *" : ""}{fieldInput(f)}
                </label>
              ))}
            </div>
          </section>
        ) : null}

        <section className="formPanel">
          <h2>Ringkasan & Pembayaran</h2>
          <div className="fieldGrid">
            <label className="formField">Diskon Order<input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="numeric" /></label>
            <label className="formField">Biaya Tambahan/Ongkir<input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="numeric" /></label>
            <label className="formField">Pajak<input value={tax} onChange={(e) => setTax(e.target.value)} inputMode="numeric" /></label>
            <div className="detailStat"><span>Total Order</span><strong>{formatIDR(grand)}</strong></div>
            <label className="formField full">Catatan Pelanggan<textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} /></label>
            <label className="formField full">Catatan Internal<textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} /></label>
            {canPay ? (
              <>
                <label className="formField">DP/Pembayaran Awal<input value={initialAmount} onChange={(e) => setInitialAmount(e.target.value)} inputMode="numeric" /></label>
                <label className="formField">Metode<select value={initialMethod} onChange={(e) => setInitialMethod(e.target.value)}>{methods.length ? methods.map((m) => <option key={m.id} value={m.name}>{m.name}</option>) : <><option>cash</option><option>transfer</option></>}</select></label>
                <label className="formField full">Referensi Pembayaran<input value={initialRef} onChange={(e) => setInitialRef(e.target.value)} /></label>
              </>
            ) : null}
          </div>
          <div className="invoiceTotals">
            <div className="invoiceTotalRow"><span>Subtotal</span><b>{formatIDR(subtotal)}</b></div>
            <div className="invoiceTotalRow"><span>Diskon</span><b>- {formatIDR(moneyInput(discount))}</b></div>
            <div className="invoiceTotalRow"><span>Biaya + Pajak</span><b>{formatIDR(moneyInput(fee) + moneyInput(tax))}</b></div>
            <div className="invoiceTotalRow grand"><span>Total</span><b>{formatIDR(grand)}</b></div>
          </div>
          <FormActions saving={saving} submitLabel="Simpan Order & Buat Invoice" />
        </section>
      </form>
    </>
  );
}
