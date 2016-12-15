
// This interface appears several times in the distributed SOCKS server:
//  - SOCKS server -> SOCKS session
//  - SOCKS session -> forwarding socket
// This comes at the expense of making names very abstract.
export interface SocksPiece {
  onDataForSocksClient: (callback: (buffer: ArrayBuffer) => void) => SocksPiece;
  onDisconnect: (callback: () => void) => SocksPiece;

  handleDataFromSocksClient: (buffer: ArrayBuffer) => void;
  handleDisconnect: () => void;
}