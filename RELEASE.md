# リリース手順

このドキュメントでは、Chrome拡張機能のCRXファイルをGitHub Actionsで自動ビルドしてリリースする手順を説明します。

## 初回セットアップ

### 1. 秘密鍵の生成

初回のみ、CRXファイルに署名するための秘密鍵を生成する必要があります。

#### 方法A: GitHub Actionsで生成（推奨）

1. GitHubリポジトリページで **Actions** タブを開く
2. 左サイドバーから **Generate CRX Private Key (Manual)** を選択
3. **Run workflow** ボタンをクリック
4. ワークフロー実行後、生成されたArtifactをダウンロード
5. ダウンロードした `private-key.pem` をBase64エンコード:
   ```bash
   base64 -w 0 private-key.pem
   ```

#### 方法B: ローカルで生成

```bash
# 秘密鍵を生成
openssl genpkey -algorithm RSA -out private-key.pem -pkeyopt rsa_keygen_bits:2048

# Base64エンコード
base64 -w 0 private-key.pem
```

### 2. GitHub Secretsに秘密鍵を登録

1. GitHubリポジトリページで **Settings** > **Secrets and variables** > **Actions** を開く
2. **New repository secret** をクリック
3. 以下を入力:
   - **Name**: `CRX_PRIVATE_KEY`
   - **Secret**: 上記でBase64エンコードした秘密鍵の内容
4. **Add secret** をクリック

**重要**: `private-key.pem` ファイルは安全な場所に保管してください。紛失すると、既存のCRXファイルと互換性のない新しいCRXが生成されます。

## リリース方法

### 1. バージョンの更新

`manifest.json` の `version` フィールドを更新します:

```json
{
  "version": "1.5"
}
```

### 2. 変更をコミット・プッシュ

```bash
git add manifest.json
git commit -m "Bump version to 1.5"
git push origin main
```

### 3. タグを作成してプッシュ

```bash
# タグを作成（バージョン番号の前に v を付ける）
git tag v1.5

# タグをプッシュ
git push origin v1.5
```

### 4. 自動ビルド・リリース

タグがプッシュされると、GitHub Actionsが自動的に:
1. CRXファイルをビルド
2. ZIPファイルを作成（バックアップ用）
3. GitHub Releasesにファイルを添付してリリースを作成

## インストール方法

リリースされたCRXファイルをユーザーにインストールしてもらう方法:

### CRXファイルからのインストール

1. GitHub Releasesから `.crx` ファイルをダウンロード
2. Chromeで `chrome://extensions/` を開く
3. 右上の「デベロッパーモード」を有効化
4. CRXファイルをページにドラッグ&ドロップ

### ZIPファイルからのインストール（代替方法）

1. GitHub Releasesから `.zip` ファイルをダウンロード・解凍
2. Chromeで `chrome://extensions/` を開く
3. 右上の「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. 解凍したフォルダを選択

## トラブルシューティング

### ビルドが失敗する

- GitHub Secretsに `CRX_PRIVATE_KEY` が正しく設定されているか確認
- Base64エンコードが正しく行われているか確認

### インストール時にエラーが出る

- Chromeのデベロッパーモードが有効になっているか確認
- CRXファイルが破損していないか確認（再ダウンロード）

### 既存のCRXと互換性がない

- 同じ秘密鍵 (`private-key.pem`) を使用しているか確認
- 秘密鍵を紛失した場合は、新しい鍵を生成してユーザーに拡張機能の再インストールを依頼
