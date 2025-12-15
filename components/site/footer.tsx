export default function Footer() {
  return (
    <footer
      className="text-[#e0e7ff] py-12"
      style={{
        background: "linear-gradient(135deg, #3f4174 0%, #5599fe 100%)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-4 text-white">Docs</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="/api/v1/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#e0e7ff] hover:text-white transition-colors"
                >
                  API Reference
                </a>
              </li>
              <li>
                <a
                  href="https://hashgraphonline.com/docs/standards/hcs-1"
                  className="text-[#e0e7ff] hover:text-white transition-colors"
                >
                  Standards
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4 text-white">Community</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://t.me/hashinals"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#e0e7ff] hover:text-white transition-colors"
                >
                  Telegram
                </a>
              </li>
              <li>
                <a
                  href="https://x.com/HashgraphOnline"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#e0e7ff] hover:text-white transition-colors"
                >
                  X
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4 text-white">More</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://hashgraphonline.com/blog"
                  className="text-[#e0e7ff] hover:text-white transition-colors"
                >
                  Blog
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/hashgraph-online"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#e0e7ff] hover:text-white transition-colors"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://hol.org/points/legal/privacy"
                  className="text-[#e0e7ff] hover:text-white transition-colors"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="https://hol.org/points/legal/terms"
                  className="text-[#e0e7ff] hover:text-white transition-colors"
                >
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-[#e0e7ff]/20 text-center">
          <p className="text-[#bfdbfe] text-sm">
            Copyright © {new Date().getFullYear()} Hashgraph Online DAO LLC.
          </p>
        </div>
      </div>
    </footer>
  );
}

