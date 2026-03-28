<template>
  <Teleport to="body">
    <div v-if="visible" class="privacy-backdrop">
      <div class="privacy-modal" role="dialog" aria-modal="true">

        <!-- Header -->
        <div class="privacy-modal-header">
          <div>
            <h2 class="privacy-modal-title">{{ t('privacy.title') }}</h2>
            <p class="privacy-modal-subtitle">{{ t('privacy.lastUpdated') }}: 2026-03-28</p>
          </div>
          <div class="privacy-lang-toggle">
            <button class="lang-btn" :class="{ active: viewLang === 'en' }" @click="viewLang = 'en'">EN</button>
            <button class="lang-btn" :class="{ active: viewLang === 'zh' }" @click="viewLang = 'zh'">中文</button>
          </div>
        </div>

        <!-- Scrollable body -->
        <div class="privacy-modal-body">

          <!-- English -->
          <template v-if="viewLang === 'en'">
            <section class="privacy-section">
              <h2>1. Introduction</h2>
              <p>ClankAI ("we", "our", or "the application") is a desktop application that runs locally on your computer. We are committed to protecting your privacy. This Privacy Policy explains what information we collect, how we use it, and your choices regarding your data.</p>
            </section>

            <section class="privacy-section">
              <h2>2. Information We Collect</h2>
              <h3>2.1 Anonymous Installation Statistics</h3>
              <p>When you first launch the application, we may send <strong>anonymous installation data</strong> to our server for the sole purpose of counting the number of installations. This includes:</p>
              <ul>
                <li>A <strong>one-way cryptographic hash</strong> (SHA-256) of your machine's hardware identifiers. This hash cannot be reversed to recover the original hardware information.</li>
                <li>The application version number.</li>
              </ul>
              <p>We do <strong>not</strong> collect your IP address, name, email, or any other personally identifiable information through this process.</p>

              <h3>2.2 Information We Do NOT Collect</h3>
              <ul>
                <li>Chat messages, conversations, or any content you create</li>
                <li>API keys or credentials you configure</li>
                <li>Files you open, edit, or process</li>
                <li>Your IP address (our server does not log request IPs)</li>
                <li>Browsing or usage behavior within the application</li>
                <li>Any personally identifiable information</li>
              </ul>
            </section>

            <section class="privacy-section">
              <h2>3. How We Use Information</h2>
              <p>The anonymous installation hash is used <strong>exclusively</strong> to:</p>
              <ul>
                <li>Count the total number of unique installations</li>
                <li>Deduplicate repeated installations on the same machine</li>
              </ul>
              <p>We do not use this data for tracking, profiling, advertising, or any other purpose.</p>
            </section>

            <section class="privacy-section">
              <h2>4. Data Storage</h2>
              <h3>4.1 Local Data</h3>
              <p>All your application data (chats, agent configurations, API keys, knowledge base, etc.) is stored <strong>locally on your computer</strong> in the application data directory. We have no access to this data.</p>
              <h3>4.2 Server-Side Data</h3>
              <p>The only data stored on our server is the anonymous installation hash and version number. No personal data is stored.</p>
            </section>

            <section class="privacy-section">
              <h2>5. Third-Party Services</h2>
              <p>ClankAI connects to third-party AI services (such as Anthropic, OpenAI, OpenRouter) using API keys <strong>you provide</strong>. These connections are made directly from your computer to those services. We do not proxy, intercept, or store any of this traffic. Please refer to the respective privacy policies of those services for their data practices.</p>
            </section>

            <section class="privacy-section">
              <h2>6. Your Choices</h2>
              <p>You can disable anonymous installation statistics in the application settings. When disabled, no data will be sent to our server.</p>
            </section>

            <section class="privacy-section">
              <h2>7. Data Security</h2>
              <p>The anonymous hash is transmitted over HTTPS. Since we only store irreversible hashes, even in the unlikely event of a data breach, no personal information could be compromised.</p>
            </section>

            <section class="privacy-section">
              <h2>8. Children's Privacy</h2>
              <p>ClankAI does not knowingly collect any personal information from children under 13 (or the applicable age in your jurisdiction).</p>
            </section>

            <section class="privacy-section">
              <h2>9. Changes to This Policy</h2>
              <p>We may update this Privacy Policy from time to time. Changes will be reflected in the "Last Updated" date at the top of this page and in the application release notes.</p>
            </section>

            <section class="privacy-section">
              <h2>10. Contact</h2>
              <p>If you have any questions about this Privacy Policy, please open an issue on our GitHub repository or contact us at the email provided in the application's About page.</p>
            </section>
          </template>

          <!-- Chinese -->
          <template v-else>
            <section class="privacy-section">
              <h2>1. 简介</h2>
              <p>ClankAI（以下简称"我们"或"本应用"）是一款在您计算机上本地运行的桌面应用程序。我们致力于保护您的隐私。本隐私政策说明了我们收集哪些信息、如何使用这些信息，以及您对数据的选择权。</p>
            </section>

            <section class="privacy-section">
              <h2>2. 我们收集的信息</h2>
              <h3>2.1 匿名安装统计</h3>
              <p>当您首次启动应用时，我们可能会向服务器发送<strong>匿名安装数据</strong>，仅用于统计安装数量。这些数据包括：</p>
              <ul>
                <li>您机器硬件标识的<strong>单向加密哈希值</strong>（SHA-256）。该哈希值无法被逆向还原为原始硬件信息。</li>
                <li>应用版本号。</li>
              </ul>
              <p>在此过程中，我们<strong>不会</strong>收集您的 IP 地址、姓名、电子邮件或任何其他可识别个人身份的信息。</p>

              <h3>2.2 我们不收集的信息</h3>
              <ul>
                <li>聊天消息、对话或您创建的任何内容</li>
                <li>您配置的 API 密钥或凭据</li>
                <li>您打开、编辑或处理的文件</li>
                <li>您的 IP 地址（我们的服务器不记录请求 IP）</li>
                <li>应用内的浏览或使用行为</li>
                <li>任何可识别个人身份的信息</li>
              </ul>
            </section>

            <section class="privacy-section">
              <h2>3. 信息使用方式</h2>
              <p>匿名安装哈希<strong>仅</strong>用于：</p>
              <ul>
                <li>统计唯一安装总数</li>
                <li>对同一台机器的重复安装进行去重</li>
              </ul>
              <p>我们不会将此数据用于追踪、用户画像、广告或任何其他目的。</p>
            </section>

            <section class="privacy-section">
              <h2>4. 数据存储</h2>
              <h3>4.1 本地数据</h3>
              <p>您所有的应用数据（聊天记录、数字人配置、API 密钥、知识库等）均<strong>存储在您的计算机本地</strong>应用数据目录中。我们无法访问这些数据。</p>
              <h3>4.2 服务端数据</h3>
              <p>我们服务器上存储的唯一数据是匿名安装哈希和版本号，不存储任何个人数据。</p>
            </section>

            <section class="privacy-section">
              <h2>5. 第三方服务</h2>
              <p>ClankAI 使用<strong>您提供的</strong> API 密钥连接第三方 AI 服务（如 Anthropic、OpenAI、OpenRouter）。这些连接从您的计算机直接发起。我们不代理、拦截或存储任何此类通信。有关这些服务的数据实践，请参阅其各自的隐私政策。</p>
            </section>

            <section class="privacy-section">
              <h2>6. 您的选择</h2>
              <p>您可以在应用设置中关闭匿名安装统计功能。关闭后，不会向我们的服务器发送任何数据。</p>
            </section>

            <section class="privacy-section">
              <h2>7. 数据安全</h2>
              <p>匿名哈希通过 HTTPS 传输。由于我们仅存储不可逆的哈希值，即使在极不可能发生数据泄露的情况下，也不会泄露任何个人信息。</p>
            </section>

            <section class="privacy-section">
              <h2>8. 儿童隐私</h2>
              <p>ClankAI 不会故意收集 13 岁以下（或您所在地区适用年龄以下）儿童的任何个人信息。</p>
            </section>

            <section class="privacy-section">
              <h2>9. 政策变更</h2>
              <p>我们可能会不时更新本隐私政策。变更将体现在本页面顶部的"最后更新"日期以及应用发行说明中。</p>
            </section>

            <section class="privacy-section">
              <h2>10. 联系方式</h2>
              <p>如果您对本隐私政策有任何疑问，请在我们的 GitHub 仓库中提交 Issue，或通过应用"关于"页面中提供的电子邮件联系我们。</p>
            </section>
          </template>

        </div>

        <!-- Footer -->
        <div class="privacy-modal-footer">
          <button class="privacy-cancel-btn" @click="$emit('cancel')">{{ t('common.cancel') }}</button>
          <button class="privacy-agree-btn" @click="$emit('agree')">{{ t('privacy.agree') }}</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from '../../i18n/useI18n'
import { useConfigStore } from '../../stores/config'

defineOptions({ inheritAttrs: false })
defineProps({ visible: { type: Boolean, default: false } })
defineEmits(['agree', 'cancel'])

const { t } = useI18n()
const configStore = useConfigStore()
const viewLang = ref(configStore.language || 'en')
</script>

<style scoped>
.privacy-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}

.privacy-modal {
  width: 80%;
  height: 80%;
  max-width: 56rem;
  background: #FFFFFF;
  border-radius: 0.75rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.privacy-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #E5E5EA;
  flex-shrink: 0;
}

.privacy-modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}

.privacy-modal-subtitle {
  font-size: 0.75rem;
  color: #999;
  margin: 0.125rem 0 0;
}

.privacy-lang-toggle {
  display: flex;
  gap: 0.25rem;
  background: #F0F0F0;
  border-radius: 0.5rem;
  padding: 0.1875rem;
}

.lang-btn {
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  color: #666;
  transition: all 0.15s;
}

.lang-btn.active {
  background: #FFFFFF;
  color: #1A1A1A;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.lang-btn:hover:not(.active) {
  color: #333;
}

.privacy-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem 1.5rem;
}

.privacy-section {
  margin-bottom: 1.5rem;
}

.privacy-section h2 {
  font-size: 1rem;
  font-weight: 600;
  color: #1A1A1A;
  margin: 0 0 0.625rem;
  padding-bottom: 0.375rem;
  border-bottom: 1px solid #F0F0F0;
}

.privacy-section h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: #333;
  margin: 0.75rem 0 0.375rem;
}

.privacy-section p {
  font-size: 0.8125rem;
  line-height: 1.7;
  color: #444;
  margin: 0 0 0.375rem;
}

.privacy-section ul {
  margin: 0.375rem 0;
  padding-left: 1.25rem;
}

.privacy-section li {
  font-size: 0.8125rem;
  line-height: 1.7;
  color: #444;
  margin-bottom: 0.125rem;
}

.privacy-section strong {
  color: #1A1A1A;
}

.privacy-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.625rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #E5E5EA;
  flex-shrink: 0;
}

.privacy-cancel-btn {
  padding: 0.5rem 1.25rem;
  border: 1px solid #D1D5DB;
  border-radius: 0.5rem;
  background: #FFFFFF;
  color: #374151;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.privacy-cancel-btn:hover {
  background: #F9FAFB;
  border-color: #9CA3AF;
}

.privacy-agree-btn {
  padding: 0.5rem 1.25rem;
  border: none;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151);
  color: #FFFFFF;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.privacy-agree-btn:hover {
  opacity: 0.9;
}
</style>
