# 学際 予算・売上計算アプリ

学園祭・学際イベント向けに、材料費・予算・売上・利益・損益分岐点を計算するWebアプリです。

## 主な機能

- 材料・数量・単価から材料費を集計
- 販売価格と販売予定数から売上・利益を試算
- 予備費率を含む必要予算の計算
- 損益分岐点、1杯あたり原価、時間あたり販売数の計算
- ブラウザー内への自動保存
- Supabaseを使った端末間クラウド同期（同じアカウントで複数端末から利用）
- 印刷・PDF出力

## 起動方法

`index.html` をブラウザーで開くか、GitHub Pagesで公開してください。

## 端末間共有の設定（初回のみ）

端末間同期には無料枠のあるSupabaseプロジェクトが必要です。GitHub Pagesだけでは、端末をまたいでデータを共有するためのデータベースは提供されません。

1. [Supabase](https://supabase.com/)でプロジェクトを作成します。
2. Supabaseの **Project URL** と **anon / publishable key** をアプリの「端末間のデータ共有」に入力し、「接続設定を保存」を押します。サービスロールキー（secret/service_role）は絶対に入力しないでください。
3. Supabaseの **SQL Editor** で次のSQLを一度実行し、ログイン中のユーザー本人だけが自分の保存データを読める・更新できるようにします。

```sql
create table if not exists public.app_data (
  id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_data enable row level security;

create policy "Users can read their own app data"
on public.app_data for select
to authenticated
using (auth.uid() = id);

create policy "Users can insert their own app data"
on public.app_data for insert
to authenticated
with check (auth.uid() = id);

create policy "Users can update their own app data"
on public.app_data for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

grant select, insert, update on public.app_data to authenticated;
```

4. アプリでメールアドレスとパスワードを入力し、「アカウント作成」を押します。メール確認が有効なら、確認メールのリンクを開いてからログインしてください。
5. 共有したい各端末で同じProject URL・公開用キーを設定し、同じアカウントでログインします。ログイン時にクラウドの保存データを読み込み、変更は約1.2秒後に自動保存されます。必要に応じて「クラウドから読み込む」「クラウドに保存」も利用できます。

## 保存とセキュリティ上の注意

- ログイン前は従来どおり、そのブラウザーの `localStorage` に保存されます。
- クラウド同期は、ログインしたユーザーのIDごとにデータを保存します。別の端末で同じアカウントにログインすると同じデータを利用できます。
- URLと公開用キーは各端末のブラウザーに保存されます。パスワードはアプリ内に保存しません。
- 公開用 anon / publishable key はブラウザーで利用する前提のキーです。サービスロールキーなどの秘密鍵はフロントエンドに置かないでください。アクセス制御は上記RLSポリシーで行います。
- 複数端末で同時に編集した場合は、最後に保存された内容が優先されます。重要なデータは定期的に印刷/PDF保存してください。

## よくあるエラー

- `relation "public.app_data" does not exist`: SQL Editorでテーブル作成SQLを実行してください。
- `permission denied` または `row-level security` 関連エラー: RLSポリシーとログイン状態を確認してください。
- ログイン時にメール確認を求められる: メールの確認リンクを開いてからログインしてください。
